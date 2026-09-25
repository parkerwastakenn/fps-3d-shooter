// Three.js Scene Setup
const canvas = document.getElementById('canvas');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x1a1a1a);
renderer.shadowMap.enabled = true;

camera.position.set(0, 1.6, 5);

// Physics World
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);
world.defaultContactMaterial.friction = 0.4;

// Game Variables
let gameState = {
    health: 100,
    ammo: 30,
    ammoMax: 30,
    score: 0,
    isRunning: true
};

let keys = {};
let enemies = [];
let bullets = [];
let lastShotTime = 0;
const fireRate = 100; // milliseconds between shots

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(50, 50, 50);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
scene.add(directionalLight);

// Create Ground
const groundGeometry = new THREE.PlaneGeometry(100, 100);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
world.addBody(groundBody);

// Create Buildings
function createBuilding(x, z, width, height, depth) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const building = new THREE.Mesh(geometry, material);
    building.position.set(x, height / 2, z);
    building.castShadow = true;
    building.receiveShadow = true;
    scene.add(building);
    
    const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(width/2, height/2, depth/2)) });
    body.position.set(x, height / 2, z);
    world.addBody(body);
}

createBuilding(-15, -20, 10, 8, 10);
createBuilding(15, -20, 10, 8, 10);
createBuilding(0, -40, 20, 6, 10);
createBuilding(-30, 0, 8, 10, 8);
createBuilding(30, 0, 8, 10, 8);

// Player Controller
class Player {
    constructor() {
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.speed = 0.2;
        this.jumpForce = 0.15;
        this.isJumping = false;
    }
    
    update() {
        this.direction.set(0, 0, 0);
        
        if (keys['w'] || keys['W']) this.direction.z -= 1;
        if (keys['s'] || keys['S']) this.direction.z += 1;
        if (keys['a'] || keys['A']) this.direction.x -= 1;
        if (keys['d'] || keys['D']) this.direction.x += 1;
        
        if (this.direction.length() > 0) {
            this.direction.normalize();
            this.applyDirectionToCamera();
        }
        
        if ((keys[' '] || keys['Spacebar']) && !this.isJumping) {
            this.velocity.y += this.jumpForce;
            this.isJumping = true;
        }
        
        this.velocity.y -= 0.01;
        camera.position.add(this.direction.multiplyScalar(this.speed));
        camera.position.y += this.velocity.y;
        
        if (camera.position.y <= 1.6) {
            camera.position.y = 1.6;
            this.isJumping = false;
            this.velocity.y = 0;
        }
    }
    
    applyDirectionToCamera() {
        const rotationMatrix = new THREE.Matrix4();
        rotationMatrix.makeRotationFromEuler(camera.rotation);
        this.direction.applyMatrix4(rotationMatrix);
    }
}

const player = new Player();
let mouseX = 0;
let mouseY = 0;

// Mouse Look
document.addEventListener('mousemove', (e) => {
    mouseX += e.movementX * 0.005;
    mouseY += e.movementY * 0.005;
    mouseY = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, mouseY));
    
    camera.rotation.order = 'YXZ';
    camera.rotation.y = mouseX;
    camera.rotation.x = mouseY;
});

// Pointer Lock
canvas.addEventListener('click', () => canvas.requestPointerLock());

// Keyboard Input
document.addEventListener('keydown', (e) => {
    keys[e.key] = true;
});

document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// Bullet Class
class Bullet {
    constructor(x, y, z, dirX, dirY, dirZ) {
        const geometry = new THREE.SphereGeometry(0.1, 8, 8);
        const material = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(x, y, z);
        scene.add(this.mesh);
        
        this.velocity = new THREE.Vector3(dirX, dirY, dirZ).normalize().multiplyScalar(1.5);
        this.lifetime = 200; // frames
        this.active = true;
    }
    
    update() {
        this.mesh.position.add(this.velocity);
        this.lifetime--;
        
        if (this.lifetime <= 0) {
            scene.remove(this.mesh);
            this.active = false;
        }
    }
}

// Enemy Class
class Enemy {
    constructor(x, z) {
        const geometry = new THREE.BoxGeometry(1, 2, 1);
        const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(x, 1, z);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        scene.add(this.mesh);
        
        this.health = 100;
        this.speed = 0.05;
        this.alive = true;
    }
    
    update() {
        if (!this.alive) return;
        
        const direction = new THREE.Vector3();
        direction.subVectors(camera.position, this.mesh.position);
        direction.y = 0;
        direction.normalize();
        direction.multiplyScalar(this.speed);
        
        this.mesh.position.add(direction);
    }
    
    takeDamage(damage) {
        this.health -= damage;
        if (this.health <= 0) {
            this.alive = false;
            scene.remove(this.mesh);
            gameState.score += 100;
        }
    }
}

// Spawn Enemies
function spawnEnemy() {
    const angle = Math.random() * Math.PI * 2;
    const distance = 30 + Math.random() * 20;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const enemy = new Enemy(x, z);
    enemies.push(enemy);
}

setInterval(spawnEnemy, 2000);

// Shooting
function shoot() {
    if (gameState.ammo <= 0) return;
    
    const now = Date.now();
    if (now - lastShotTime < fireRate) return;
    
    lastShotTime = now;
    gameState.ammo--;
    
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    
    const bullet = new Bullet(
        camera.position.x + direction.x,
        camera.position.y + direction.y,
        camera.position.z + direction.z,
        direction.x,
        direction.y,
        direction.z
    );
    bullets.push(bullet);
}

// Reload
document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r') {
        gameState.ammo = gameState.ammoMax;
    }
});

canvas.addEventListener('click', shoot);

// Collision Detection
function checkBulletCollisions() {
    bullets.forEach((bullet, bulletIndex) => {
        if (!bullet.active) return;
        
        enemies.forEach((enemy) => {
            if (!enemy.alive) return;
            
            const distance = bullet.mesh.position.distanceTo(enemy.mesh.position);
            if (distance < 1) {
                enemy.takeDamage(50);
                scene.remove(bullet.mesh);
                bullet.active = false;
            }
        });
    });
}

function checkEnemyCollisions() {
    enemies.forEach((enemy) => {
        if (!enemy.alive) return;
        
        const distance = camera.position.distanceTo(enemy.mesh.position);
        if (distance < 2) {
            gameState.health -= 0.5;
            if (gameState.health <= 0) {
                gameState.isRunning = false;
            }
        }
    });
}

// Update HUD
function updateHUD() {
    document.getElementById('healthValue').textContent = Math.max(0, Math.ceil(gameState.health));
    document.getElementById('ammoValue').textContent = gameState.ammo;
    document.getElementById('scoreValue').textContent = gameState.score;
}

// Animation Loop
function animate() {
    requestAnimationFrame(animate);
    
    if (!gameState.isRunning) {
        updateHUD();
        renderer.render(scene, camera);
        return;
    }
    
    player.update();
    
    bullets.forEach((bullet) => bullet.update());
    enemies.forEach((enemy) => enemy.update());
    
    checkBulletCollisions();
    checkEnemyCollisions();
    
    bullets = bullets.filter((b) => b.active);
    enemies = enemies.filter((e) => e.alive || e.mesh.position.y > -10);
    
    world.step(1 / 60);
    updateHUD();
    renderer.render(scene, camera);
}

// Handle Window Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
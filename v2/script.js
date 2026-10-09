
    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    window.addEventListener("resize", resize);
    resize();

    function goFullScreen() {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else if (el.msRequestFullscreen) el.msRequestFullscreen();

      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock("landscape").catch(err => {
          console.warn("Orientation lock failed:", err);
        });
      }
    }

    let gameRunning = false,
        lastTime = 0,
        score = 0,
        gameSpeed = 1,
        obstacles = [],
        obstacleTimer = 0;

    const player = {
      x: 50, y: 0,
      width: 50, height: 50,
      velocityY: 0,
      jumpForce: 15,
      gravity: 0.7,
      grounded: false
    };

    const clouds = [];
    const cloudCount = 8;
    for (let i = 0; i < cloudCount; i++) {
      clouds.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height * 0.5,
        scale: 0.5 + Math.random() * 0.8
      });
    }

    function startGame() {
      if (gameRunning) return;
      gameRunning = true;
      lastTime = 0;
      score = 0;
      gameSpeed = 1;
      obstacles = [];
      obstacleTimer = 0;
      player.y = canvas.height - 150;
      player.velocityY = 0;
      player.grounded = false;

      const music = document.getElementById("bgMusic");
      music.currentTime = 0;
      music.volume = 0.5;
      music.play();

      goFullScreen();

      document.querySelector(".overlay").style.display = "none";

      requestAnimationFrame(gameLoop);
    }

    function gameLoop(ts) {
      if (!gameRunning) return;
      if (!lastTime) lastTime = ts;
      const delta = ts - lastTime;
      lastTime = ts;

      gameSpeed += delta * 0.00005;
      score += gameSpeed * delta * 0.01;

      // Sky gradient
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, "#87CEEB");
      grad.addColorStop(1, "#b0e0e6");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Clouds
      clouds.forEach(c => {
        c.x -= 0.3 * gameSpeed;
        if (c.x < -200 * c.scale) {
          c.x = canvas.width + 50;
          c.y = Math.random() * canvas.height * 0.5;
        }
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.beginPath();
        const cw = 150 * c.scale, ch = 60 * c.scale;
        ctx.ellipse(c.x, c.y, cw, ch, 0, 0, 2 * Math.PI);
        ctx.ellipse(c.x - cw * 0.6, c.y + ch * 0.1, cw * 0.7, ch * 0.7, 0, 0, 2 * Math.PI);
        ctx.ellipse(c.x + cw * 0.6, c.y + ch * 0.1, cw * 0.7, ch * 0.7, 0, 0, 2 * Math.PI);
        ctx.fill();
      });

      // Player physics
      player.velocityY += player.gravity;
      player.y += player.velocityY;
      if (player.y + player.height > canvas.height - 100) {
        player.y = canvas.height - 100 - player.height;
        player.velocityY = 0;
        player.grounded = true;
      } else {
        player.grounded = false;
      }

      // Ground
      ctx.fillStyle = "#654321";
      ctx.fillRect(0, canvas.height - 100, canvas.width, 100);

      // Player
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(player.x, player.y, player.width, player.height);

      // Obstacles
      obstacleTimer += delta;
      if (obstacleTimer > 1500) {
        const h = 40 + Math.random() * 30;
        obstacles.push({
          x: canvas.width,
          y: canvas.height - 100 - h,
          width: 20 + Math.random() * 30,
          height: h
        });
        obstacleTimer = 0;
      }

      for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        o.x -= 6 * gameSpeed;
        if (player.x < o.x + o.width &&
            player.x + player.width > o.x &&
            player.y < o.y + o.height &&
            player.y + player.height > o.y) {
          return gameOver();
        }
        if (o.x + o.width < 0) {
          obstacles.splice(i, 1);
        } else {
          ctx.fillStyle = "#000";
          ctx.fillRect(o.x, o.y, o.width, o.height);
        }
      }

      // HUD
      ctx.font = "24px sans-serif";
      ctx.fillStyle = "#00FF00";
      ctx.fillText("Score: " + Math.floor(score), 20, 40);

      ctx.fillStyle = "#00FFFF";
      ctx.fillText("Speed: " + gameSpeed.toFixed(2), 20, 70);

      // Credits
      ctx.font = "16px sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      const credit = "Developed by Toha";
      const tw = ctx.measureText(credit).width;
      ctx.fillText(credit, canvas.width - tw - 20, canvas.height - 20);

      requestAnimationFrame(gameLoop);
    }

    // Controls
    window.addEventListener("keydown", e => {
      if (e.code === "Space" && player.grounded) {
        player.velocityY = -player.jumpForce;
        player.grounded = false;
      }
    });

    window.addEventListener("touchstart", e => {
      e.preventDefault();
      if (player.grounded) {
        player.velocityY = -player.jumpForce;
        player.grounded = false;
      }
    }, { passive: false });

    function gameOver() {
      gameRunning = false;
      const music = document.getElementById("bgMusic");
      music.pause();
      music.currentTime = 0;

      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#fff";
      ctx.font = "48px sans-serif";
      ctx.fillText("Game Over", canvas.width / 2 - 120, canvas.height / 2);

      setTimeout(() => {
        document.querySelector(".overlay").style.display = "flex";
      }, 1500);
    }


    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");
    const startOverlay = document.getElementById("startOverlay");
    const rotateNotice = document.getElementById("rotateNotice");
    const scoreDisplay = document.getElementById("scoreDisplay");
    const speedDisplay = document.getElementById("speedDisplay");
    const jumpBtn = document.getElementById("jumpBtn");
    const volDownBtn = document.getElementById("volDown");
    const volUpBtn = document.getElementById("volUp");
    const bgMusic = document.getElementById("bgMusic");
    const touchNotice = document.getElementById("touchNotice");
    
    // Set initial volume to 50%
    bgMusic.volume = 0.5;
    
    // Hide touch notice initially
    touchNotice.style.display = "none";

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    window.addEventListener("resize", resize);
    resize();

    function goFullScreenAndLock() {
      const el = document.documentElement;
      const promise =
        el.requestFullscreen?.() ||
        el.webkitRequestFullscreen?.() ||
        el.msRequestFullscreen?.();

      if (promise) {
        promise.then(() => {
          if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock("landscape").catch(err => {
              console.warn("Orientation lock failed:", err);
            });
          }
        }).catch(err => {
          console.warn("Fullscreen request failed:", err);
        });
      }
    }

    function checkOrientation() {
      const isPortrait = window.innerHeight > window.innerWidth;
      rotateNotice.style.display = isPortrait ? "flex" : "none";
      
      // Auto-start in landscape if in WebView APK
      if (!isPortrait && isWebViewAPK() && !gameRunning) {
        setTimeout(startGame, 500);
      }
    }

    // Detect if we're in a WebView APK environment
    function isWebViewAPK() {
      const userAgent = navigator.userAgent.toLowerCase();
      // Check for Android WebView or iOS UIWebView/WKWebView
      return (userAgent.includes('wv') || 
             (userAgent.includes('android') && !userAgent.includes('chrome')) || 
             (userAgent.includes('iphone') && userAgent.includes('safari') && !userAgent.includes('chrome')));
    }

    window.addEventListener("orientationchange", checkOrientation);
    window.addEventListener("resize", checkOrientation);

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
      
      // Auto-rotate on mobile
      if (isMobile()) {
        goFullScreenAndLock();
      }
      
      gameRunning = true;
      lastTime = 0;
      score = 0;
      gameSpeed = 1;
      obstacles = [];
      obstacleTimer = 0;
      player.y = canvas.height - 150;
      player.velocityY = 0;
      player.grounded = false;

      // Show touch notice on mobile
      touchNotice.style.display = isMobile() ? "block" : "none";

      // Start background music
      bgMusic.currentTime = 0;
      bgMusic.play().catch(e => {
        console.log("Autoplay blocked, user interaction required");
      });

      startOverlay.classList.add("hidden");

      requestAnimationFrame(gameLoop);
    }
    
    function isMobile() {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    function gameLoop(ts) {
      if (!gameRunning) return;
      if (!lastTime) lastTime = ts;
      const delta = ts - lastTime;
      lastTime = ts;

      gameSpeed += delta * 0.00005;
      score += gameSpeed * delta * 0.01;
      
      // Update UI stats
      scoreDisplay.textContent = `Score: ${Math.floor(score)}`;
      speedDisplay.textContent = `Speed: ${gameSpeed.toFixed(2)}`;

      // Sky gradient
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, "#87CEEB");
      grad.addColorStop(1, "#b0e0e6");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw clouds
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
      
      // Draw grass on top of ground
      ctx.fillStyle = "#2a8a5c";
      ctx.fillRect(0, canvas.height - 100, canvas.width, 10);

      // Player character
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(player.x, player.y, player.width, player.height);
      
      // Player details
      ctx.fillStyle = "#333";
      ctx.fillRect(player.x + 10, player.y + 10, 15, 15); // eye
      ctx.fillRect(player.x + 25, player.y + 30, 20, 10); // mouth

      // Generate obstacles
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

      // Process obstacles
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        o.x -= 6 * gameSpeed;
        
        // Collision detection
        if (player.x < o.x + o.width &&
            player.x + player.width > o.x &&
            player.y < o.y + o.height &&
            player.y + player.height > o.y) {
          return gameOver();
        }
        
        // Remove if off screen
        if (o.x + o.width < 0) {
          obstacles.splice(i, 1);
        } else {
          // Draw obstacle
          ctx.fillStyle = "#8B4513";
          ctx.fillRect(o.x, o.y, o.width, o.height);
          
          // Draw obstacle top
          ctx.fillStyle = "#5d2900";
          ctx.fillRect(o.x, o.y, o.width, 10);
        }
      }

      requestAnimationFrame(gameLoop);
    }

    // Jump function
    function jump() {
      if (player.grounded) {
        player.velocityY = -player.jumpForce;
        player.grounded = false;
        
        // Add jump effect
        ctx.fillStyle = "rgba(15, 204, 69, 0.3)";
        ctx.beginPath();
        ctx.arc(player.x + player.width/2, player.y + player.height, 30, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Full-screen touch control
    canvas.addEventListener("touchstart", function(e) {
      e.preventDefault();
      
      // Check if touch is on UI elements
      const rect = canvas.getBoundingClientRect();
      const touchX = e.touches[0].clientX - rect.left;
      const touchY = e.touches[0].clientY - rect.top;
      
      // Define safe zones where touch doesn't trigger jump
      const isInVolumeControl = touchX > canvas.width - 100 && touchY < 100;
      const isInStatsArea = touchX < 200 && touchY < 100;
      
      if (!isInVolumeControl && !isInStatsArea) {
        jump();
      }
    }, { passive: false });

    // Full-screen click control for desktop
    canvas.addEventListener("click", function(e) {
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      
      // Define safe zones where click doesn't trigger jump
      const isInVolumeControl = clickX > canvas.width - 100 && clickY < 100;
      const isInStatsArea = clickX < 200 && clickY < 100;
      
      if (!isInVolumeControl && !isInStatsArea) {
        jump();
      }
    });

    // Button controls
    jumpBtn.addEventListener("touchstart", e => {
      e.preventDefault();
      jump();
    }, { passive: false });
    
    jumpBtn.addEventListener("mousedown", e => {
      jump();
    });

    // Volume controls
    volDownBtn.addEventListener("click", () => {
      if (bgMusic.volume > 0.1) {
        bgMusic.volume -= 0.1;
      } else {
        bgMusic.volume = 0;
      }
    });
    
    volUpBtn.addEventListener("click", () => {
      if (bgMusic.volume < 0.9) {
        bgMusic.volume += 0.1;
      } else {
        bgMusic.volume = 1;
      }
    });

    function gameOver() {
      gameRunning = false;
      
      // Hide touch notice
      touchNotice.style.display = "none";
      
      // Stop background music
      bgMusic.pause();

      // Show game over overlay
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.fillStyle = "#fff";
      ctx.font = "bold 48px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 40);
      
      ctx.font = "36px sans-serif";
      ctx.fillText(`Score: ${Math.floor(score)}`, canvas.width / 2, canvas.height / 2 + 20);
      
      ctx.font = "24px sans-serif";
      ctx.fillText("Tap anywhere to restart", canvas.width / 2, canvas.height / 2 + 80);
      
      // Set up restart
      canvas.addEventListener("click", restartGame);
      canvas.addEventListener("touchstart", restartGame);
    }
    
    function restartGame(e) {
      // Prevent restart if touch is on UI elements
      const rect = canvas.getBoundingClientRect();
      let touchX, touchY;
      
      if (e.type === "touchstart") {
        touchX = e.touches[0].clientX - rect.left;
        touchY = e.touches[0].clientY - rect.top;
      } else {
        touchX = e.clientX - rect.left;
        touchY = e.clientY - rect.top;
      }
      
      // Define safe zones where touch doesn't trigger restart
      const isInVolumeControl = touchX > canvas.width - 100 && touchY < 100;
      const isInStatsArea = touchX < 200 && touchY < 100;
      
      if (!isInVolumeControl && !isInStatsArea) {
        canvas.removeEventListener("click", restartGame);
        canvas.removeEventListener("touchstart", restartGame);
        startGame();
      }
    }

    // Initial setup
    checkOrientation();
    
    // Auto-start if in WebView APK and in landscape
    if (isWebViewAPK()) {
      const isPortrait = window.innerHeight > window.innerWidth;
      if (!isPortrait) {
        setTimeout(startGame, 1000);
      }
    }

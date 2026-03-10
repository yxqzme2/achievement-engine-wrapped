/* ===================================================
   Shared Particle Engine
   Uses EaselJS (createjs) to render ambient particles
   on the #projector canvas behind the character sheet.
=================================================== */
(function() {
    const canvas = document.getElementById('projector');
    if (!canvas || typeof createjs === 'undefined') return;

    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const stage = new createjs.Stage(canvas);
    createjs.Ticker.setFPS(30);
    createjs.Ticker.addEventListener('tick', stage);

    const PARTICLE_COUNT = 60;
    const particles = [];

    function randomParticle() {
        return {
            x:     Math.random() * canvas.width,
            y:     Math.random() * canvas.height,
            vx:    (Math.random() - 0.5) * 0.4,
            vy:    -Math.random() * 0.6 - 0.1,
            size:  Math.random() * 2 + 0.5,
            alpha: Math.random() * 0.4 + 0.05,
            life:  Math.random()
        };
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p    = randomParticle();
        const dot  = new createjs.Shape();
        dot.graphics.beginFill('rgba(132,255,255,1)').drawCircle(0, 0, p.size);
        dot.x     = p.x;
        dot.y     = p.y;
        dot.alpha = p.alpha;
        stage.addChild(dot);
        particles.push({ shape: dot, data: p });
    }

    createjs.Ticker.addEventListener('tick', function() {
        particles.forEach(({ shape, data: p }) => {
            p.x += p.vx;
            p.y += p.vy;
            p.life += 0.003;

            if (p.life > 1 || p.y < -10 || p.x < -10 || p.x > canvas.width + 10) {
                const np = randomParticle();
                np.y   = canvas.height + 5;
                Object.assign(p, np);
            }

            shape.x     = p.x;
            shape.y     = p.y;
            shape.alpha = p.alpha * (1 - p.life * 0.5);
        });
    });

    window.addEventListener('resize', function() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
    });
})();

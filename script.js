document.addEventListener('DOMContentLoaded', () => {
    // 1. Warp Scroll Effect
    const warpHero = document.querySelector('.warp-hero');
    const warpContent = document.querySelector('.warp-content');
    const greeting = document.querySelector('.large-greeting');
    const imageContainer = document.querySelector('.image-container');

    function handleWarpScroll() {
        if (!warpHero) return;

        const rect = warpHero.getBoundingClientRect();
        const heroHeight = warpHero.offsetHeight;
        const scrolled = -rect.top; // How far we've scrolled past the hero top
        const progress = Math.max(0, Math.min(1, scrolled / (heroHeight - window.innerHeight)));

        // Scale down and move upward as user scrolls
        const scale = 1 - progress * 0.5;       // 1 → 0.5
        const translateY = -progress * 30;       // 0 → -30vh (moves up)
        const opacity = 1 - progress * 0.8;      // 1 → 0.2

        if (warpContent) {
            warpContent.style.transform = `scale(${scale}) translateY(${translateY}vh)`;
        }
        if (imageContainer) {
            imageContainer.style.opacity = opacity;
        }
        if (greeting) {
            greeting.style.opacity = opacity;
        }
    }

    window.addEventListener('scroll', handleWarpScroll, { passive: true });
    handleWarpScroll(); // Initial call

    // 2. Intersection Observer for Fade-In Effects
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15
    };

    const sectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
            }
        });
    }, observerOptions);

    const fadeSections = document.querySelectorAll('.fade-in-section');
    fadeSections.forEach(section => {
        sectionObserver.observe(section);
    });

    // 3. Smooth Scrolling for Anchor Links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
});

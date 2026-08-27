// Funções para abrir e fechar os Modais (Popups)
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// Fechar modal ao clicar fora da caixa do modal
window.onclick = function(event) {
    if (event.target.classList.contains('modal-overlay')) {
        event.target.classList.remove('active');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // MENU MOBILE (Hamburguer Toggle)
    // ----------------------------------------------------
    const mobileMenu = document.getElementById('mobile-menu');
    const navWrapper = document.getElementById('nav-wrapper');
    const menuIcon = mobileMenu.querySelector('i');

    mobileMenu.addEventListener('click', () => {
        navWrapper.classList.toggle('active');
        
        // Troca o ícone de 'hamburguer' para 'X' e vice-versa
        if(navWrapper.classList.contains('active')) {
            menuIcon.classList.remove('fa-bars');
            menuIcon.classList.add('fa-xmark');
        } else {
            menuIcon.classList.remove('fa-xmark');
            menuIcon.classList.add('fa-bars');
        }
    });

    // Fecha o menu se clicar num link de rolagem no celular
    const navLinks = document.querySelectorAll('.nav-links a');
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navWrapper.classList.remove('active');
            menuIcon.classList.remove('fa-xmark');
            menuIcon.classList.add('fa-bars');
        });
    });

    // ----------------------------------------------------
    // EFEITO DO VÍDEO SEGUINDO O MOUSE/TOUCH NA HERO
    // ----------------------------------------------------
    const heroSection = document.querySelector('.hero');
    const videoBox = document.querySelector('.hero-video-container');

    function animateBox(e) {
        if (!heroSection || !videoBox) return;
        
        const rect = heroSection.getBoundingClientRect();
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const moveX = (x - centerX) * 0.05; 
        const moveY = (y - centerY) * 0.05;

        videoBox.style.transform = `translate(${moveX}px, ${moveY}px)`;
    }

    if (heroSection && videoBox) {
        heroSection.addEventListener('mousemove', animateBox);
        heroSection.addEventListener('touchmove', animateBox);
        
        heroSection.addEventListener('mouseleave', () => {
            videoBox.style.transform = `translate(0px, 0px)`;
        });
        heroSection.addEventListener('touchend', () => {
            videoBox.style.transform = `translate(0px, 0px)`;
        });
    }

    // ----------------------------------------------------
    // CONTROLE DE SOM DO VÍDEO
    // ----------------------------------------------------
    const videoObj = document.getElementById('heroVideo');
    const muteBtn = document.getElementById('muteBtn');
    
    if(videoObj && muteBtn) {
        muteBtn.addEventListener('click', () => {
            // Alterna o estado de mudo do vídeo
            videoObj.muted = !videoObj.muted;
            
            // Pega o ícone dentro do botão
            const icon = muteBtn.querySelector('i');
            
            if (videoObj.muted) {
                icon.classList.remove('fa-volume-up');
                icon.classList.add('fa-volume-xmark');
            } else {
                icon.classList.remove('fa-volume-xmark');
                icon.classList.add('fa-volume-up');
            }
        });
    }
});

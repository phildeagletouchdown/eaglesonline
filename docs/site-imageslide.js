const track = document.querySelector('.slideshow-track');
const slides = document.querySelectorAll('.slide');
const dotsContainer = document.querySelector('.slide-dots');
let currentSlide = 0;

slides.forEach((_, i) => {
  const dot = document.createElement('span');
  dot.addEventListener('click', () => goToSlide(i));
  dotsContainer.appendChild(dot);
});

const dots = document.querySelectorAll('.slide-dots span');

function updateDots() {
  dots.forEach((dot, i) => dot.classList.toggle('active', i === currentSlide));
}

function goToSlide(index) {
  currentSlide = (index + slides.length) % slides.length;
  track.scrollTo({ left: track.clientWidth * currentSlide, behavior: 'smooth' });
  updateDots();
}

track.addEventListener('scroll', () => {
  const index = Math.round(track.scrollLeft / track.clientWidth);
  if (index !== currentSlide) {
    currentSlide = index;
    updateDots();
  }
});

updateDots();
const images = ['DSCF6065.jpg', 'DSCF6066.jpg', 'DSCF6067.jpg', 'DSCF6068.jpg', 'DSCF6072.jpg', 'DSCF6074.jpg', 'DSCF6075.jpg', 'DSCF6076.jpg', 'DSCF6077.jpg', 'DSCF6078.jpg', 'DSCF6079.jpg', 'DSCF6080.jpg', 'DSCF6081.jpg', 'DSCF6082.jpg'];
const bg = document.getElementById('bg');
const tileSize = 100;

const cols = Math.ceil(window.innerWidth / tileSize);
const rows = Math.ceil(window.innerHeight / tileSize);
const count = cols * rows;

for (let i = 0; i < count; i++) {
  const img = document.createElement('img');
  img.src = images[i % images.length];
  bg.appendChild(img);
}
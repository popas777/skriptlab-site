const toggle = document.querySelector(".nav-toggle");
const menu = document.querySelector("#site-menu");
const menuLinks = document.querySelectorAll("#site-menu a");

function setMenuOpen(isOpen) {
  toggle.setAttribute("aria-expanded", String(isOpen));
  toggle.setAttribute("aria-label", isOpen ? "Sulje valikko" : "Avaa valikko");
  menu.classList.toggle("is-open", isOpen);
  document.body.classList.toggle("nav-open", isOpen);
}

toggle.addEventListener("click", () => {
  const isOpen = toggle.getAttribute("aria-expanded") === "true";
  setMenuOpen(!isOpen);
});

menuLinks.forEach((link) => {
  link.addEventListener("click", () => setMenuOpen(false));
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMenuOpen(false);
  }
});

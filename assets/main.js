const toggle = document.querySelector(".nav-toggle");
const menu = document.querySelector("#site-menu");
const menuLinks = document.querySelectorAll("#site-menu a");
const loginLinks = document.querySelectorAll(".btn-login[href=\"#login\"]");

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
    closeLoginModal();
  }
});

const modalMarkup = `
  <div class="login-modal-backdrop" data-login-modal hidden>
    <section class="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-modal-title">
      <button class="modal-close" type="button" data-close-login aria-label="Sulje kirjautumisikkuna">×</button>
      <p class="modal-label">Kirjaudu</p>
      <h2 id="login-modal-title">Sovelluksen selainkäyttö työn alla</h2>
      <p>Emme ota toistaiseksi uusia käyttäjiä.</p>
      <form class="contact-form" data-login-contact>
        <label for="contact-email">Sähköpostiosoitteesi</label>
        <input id="contact-email" name="email" type="email" autocomplete="email" placeholder="nimi@example.com">

        <label for="contact-message">Ota yhteyttä</label>
        <textarea id="contact-message" name="message" rows="5" placeholder="Kerro lyhyesti, mistä haluaisit kuulla lisää."></textarea>

        <button class="btn-primary" type="submit">Lähetä sähköposti</button>
      </form>
    </section>
  </div>
`;

document.body.insertAdjacentHTML("beforeend", modalMarkup);

const loginModal = document.querySelector("[data-login-modal]");
const closeLoginButton = document.querySelector("[data-close-login]");
const contactForm = document.querySelector("[data-login-contact]");
let previouslyFocusedElement = null;

function openLoginModal() {
  previouslyFocusedElement = document.activeElement;
  loginModal.hidden = false;
  document.body.classList.add("modal-open");
  closeLoginButton.focus();
}

function closeLoginModal() {
  if (!loginModal || loginModal.hidden) return;

  loginModal.hidden = true;
  document.body.classList.remove("modal-open");

  if (previouslyFocusedElement) {
    previouslyFocusedElement.focus();
  }
}

loginLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    setMenuOpen(false);
    openLoginModal();
  });
});

closeLoginButton.addEventListener("click", closeLoginModal);

loginModal.addEventListener("click", (event) => {
  if (event.target === loginModal) {
    closeLoginModal();
  }
});

contactForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(contactForm);
  const email = String(formData.get("email") || "").trim();
  const message = String(formData.get("message") || "").trim();
  const body = [
    "Hei SkriptLab,",
    "",
    message || "Haluaisin kuulla lisää SkriptLabista.",
    "",
    email ? `Vastausosoitteeni: ${email}` : ""
  ].filter(Boolean).join("\n");

  window.location.href = `mailto:skriptlab@skriptlab.com?subject=${encodeURIComponent("Yhteydenotto SkriptLabista")}&body=${encodeURIComponent(body)}`;
});

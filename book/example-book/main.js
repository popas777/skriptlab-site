const characterData = {
  dorothea: {
    role: "Unelmoija · tarkoitus",
    name: "Dorothea Brooke",
    description: "Älykäs ja idealistinen nuori nainen, joka haluaa elämältään enemmän kuin seurapiirit hänelle tarjoavat. Hänen kaipuunsa merkitykseen johtaa ensin väärään avioliittoon – ja sitten oman äänen äärelle.",
    links: ["Edward Casaubon", "Will Ladislaw"]
  },
  casaubon: {
    role: "Oppinut · velvollisuus",
    name: "Edward Casaubon",
    description: "Arvostettu mutta sisäänpäin kääntynyt oppinut, jonka elämäntyö on paisunut suuremmaksi kuin elämä itse. Avioliitto Dorothean kanssa paljastaa, kuinka kaukana ihanne ja todellisuus voivat olla toisistaan.",
    links: ["Dorothea Brooke", "Will Ladislaw"]
  },
  will: {
    role: "Ulkopuolinen · vapaus",
    name: "Will Ladislaw",
    description: "Eloisa taiteilija ja uudistusmielinen idealisti, jonka tausta tekee hänestä Middlemarchin silmissä epäilyttävän. Will näkee Dorotheassa sen voiman, jota tämä ei vielä itse tunnista.",
    links: ["Dorothea Brooke", "Edward Casaubon"]
  },
  lydgate: {
    role: "Uudistaja · kunnianhimo",
    name: "Tertius Lydgate",
    description: "Nuori lääkäri saapuu kaupunkiin suurin suunnitelmin. Tiede, velka ja avioliitto alkavat kuitenkin vetää häntä eri suuntiin – eikä pelkkä lahjakkuus riitä pitämään ihanteita elossa.",
    links: ["Rosamond Vincy", "Nicholas Bulstrode"]
  },
  rosamond: {
    role: "Esteetikko · asema",
    name: "Rosamond Vincy",
    description: "Kauneuteen, tyyliin ja parempaan asemaan kasvatettu Rosamond tietää täsmälleen, miltä hänen elämänsä pitäisi näyttää. Todellisuus ei vain suostu noudattamaan hänen käsikirjoitustaan.",
    links: ["Tertius Lydgate", "Fred Vincy"]
  },
  fred: {
    role: "Etsijä · kasvu",
    name: "Fred Vincy",
    description: "Hyväntahtoinen mutta vastuuton nuori mies, joka odottaa elämän järjestyvän hänen puolestaan. Maryn rehellisyys pakottaa Fredin päättämään, millaiseksi ihmiseksi hän todella haluaa tulla.",
    links: ["Mary Garth", "Rosamond Vincy"]
  },
  mary: {
    role: "Realisti · rehellisyys",
    name: "Mary Garth",
    description: "Terävä, käytännöllinen ja lämminsydäminen Mary ei anna kenenkään romantisoida huonoja valintojaan. Hän on kaupungin hiljaisia moraalisia keskuksia – ja Fredin tärkein peili.",
    links: ["Fred Vincy", "Caleb Garth"]
  }
};

const characterButtons = document.querySelectorAll("[data-character]");
const detailRole = document.querySelector("[data-character-role]");
const detailName = document.querySelector("[data-character-name]");
const detailDescription = document.querySelector("[data-character-description]");
const detailLinks = document.querySelector("[data-character-links]");

characterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const character = characterData[button.dataset.character];
    if (!character) return;

    characterButtons.forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });

    detailRole.textContent = character.role;
    detailName.textContent = character.name;
    detailDescription.textContent = character.description;
    detailLinks.replaceChildren(...character.links.map((name) => {
      const item = document.createElement("span");
      item.textContent = name;
      return item;
    }));
  });
});

const dialogs = document.querySelectorAll("dialog");

document.querySelectorAll("[data-open-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    const dialog = document.getElementById(button.dataset.openDialog);
    if (!dialog) return;
    dialog.showModal();
    document.body.classList.add("dialog-open");
  });
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog")?.close());
});

dialogs.forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => document.body.classList.remove("dialog-open"));
});

document.querySelectorAll("[data-demo-retailer]").forEach((button) => {
  button.addEventListener("click", () => {
    const note = button.closest("dialog")?.querySelector("[data-dialog-note]");
    if (note) note.textContent = `${button.querySelector("strong")?.textContent}: linkki lisätään julkaisun yhteydessä.`;
  });
});

const player = document.querySelector("[data-audio-player]");
const playButton = player?.querySelector("[data-play]");
const progressBar = player?.querySelector(".progress");
const progressFill = player?.querySelector("[data-progress]");
const timeLabel = player?.querySelector("[data-time]");
const audioStatus = document.querySelector("[data-audio-status]");
const sampleDuration = 32;
const sampleText = "Middlemarchissa uutinen kulki nopeammin kuin postivaunu. Kun Dorothea Brooke päätti mennä naimisiin herra Casaubonin kanssa, jokaisella oli siitä mielipide – paitsi Dorothealla itsellään, joka luuli jo löytäneensä elämälleen tarkoituksen. Mutta pikkukaupungissa yhden ihmisen toiveet osuvat aina jonkun toisen suunnitelmiin.";
let speech;
let startedAt = 0;
let elapsedBeforePause = 0;
let timer;
let playing = false;
let paused = false;

function formatTime(seconds) {
  return `0:${String(Math.max(0, Math.min(sampleDuration, Math.round(seconds)))).padStart(2, "0")}`;
}

function renderProgress(seconds) {
  const safeSeconds = Math.max(0, Math.min(sampleDuration, seconds));
  const ratio = safeSeconds / sampleDuration;
  if (progressFill) progressFill.style.width = `${ratio * 100}%`;
  if (timeLabel) timeLabel.textContent = `${formatTime(safeSeconds)} / 0:32`;
  if (progressBar) progressBar.setAttribute("aria-valuenow", String(Math.round(safeSeconds)));
}

function stopTimer() {
  window.clearInterval(timer);
  timer = undefined;
}

function startTimer() {
  stopTimer();
  startedAt = Date.now();
  timer = window.setInterval(() => {
    const current = elapsedBeforePause + (Date.now() - startedAt) / 1000;
    renderProgress(current);
  }, 180);
}

function resetPlayer(complete = false) {
  stopTimer();
  playing = false;
  paused = false;
  elapsedBeforePause = 0;
  player?.classList.remove("is-playing");
  playButton?.setAttribute("aria-pressed", "false");
  playButton?.setAttribute("aria-label", "Toista ääninäyte");
  renderProgress(complete ? sampleDuration : 0);
  if (complete) window.setTimeout(() => renderProgress(0), 1000);
}

function selectFinnishVoice() {
  return window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("fi"));
}

playButton?.addEventListener("click", () => {
  if (!("speechSynthesis" in window)) {
    if (audioStatus) audioStatus.textContent = "Selaimesi ei tue tämän demon äänitoistoa.";
    return;
  }

  if (playing && !paused) {
    window.speechSynthesis.pause();
    elapsedBeforePause += (Date.now() - startedAt) / 1000;
    paused = true;
    stopTimer();
    player?.classList.remove("is-playing");
    playButton.setAttribute("aria-pressed", "false");
    playButton.setAttribute("aria-label", "Jatka ääninäytettä");
    if (audioStatus) audioStatus.textContent = "Ääninäyte on tauolla.";
    return;
  }

  if (playing && paused) {
    window.speechSynthesis.resume();
    paused = false;
    startTimer();
    player?.classList.add("is-playing");
    playButton.setAttribute("aria-pressed", "true");
    playButton.setAttribute("aria-label", "Keskeytä ääninäyte");
    if (audioStatus) audioStatus.textContent = "Ääninäyte jatkuu.";
    return;
  }

  window.speechSynthesis.cancel();
  speech = new SpeechSynthesisUtterance(sampleText);
  speech.lang = "fi-FI";
  speech.rate = 0.88;
  speech.pitch = 0.94;
  const voice = selectFinnishVoice();
  if (voice) speech.voice = voice;

  speech.onstart = () => {
    playing = true;
    paused = false;
    elapsedBeforePause = 0;
    startTimer();
    player?.classList.add("is-playing");
    playButton.setAttribute("aria-pressed", "true");
    playButton.setAttribute("aria-label", "Keskeytä ääninäyte");
    if (audioStatus) audioStatus.textContent = "Toistetaan esittelynäytettä.";
  };
  speech.onend = () => {
    resetPlayer(true);
    if (audioStatus) audioStatus.textContent = "Ääninäyte päättyi.";
  };
  speech.onerror = () => {
    resetPlayer(false);
    if (audioStatus) audioStatus.textContent = "Ääninäytettä ei voitu toistaa tässä selaimessa.";
  };

  window.speechSynthesis.speak(speech);
});

window.addEventListener("pagehide", () => {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
});

const revealItems = document.querySelectorAll(".reveal");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (reduceMotion || !("IntersectionObserver" in window)) {
  revealItems.forEach((item) => item.classList.add("is-visible"));
} else {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  revealItems.forEach((item) => observer.observe(item));
}

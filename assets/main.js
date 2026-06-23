const LANGUAGE_KEY = "skriptlab_site_language";
const SUPPORTED_LANGUAGES = ["fi", "en"];

const pageFile = window.location.pathname.endsWith("/")
  ? "index.html"
  : window.location.pathname.split("/").pop();

const pageKey = window.location.pathname.includes("/legal/")
  ? `legal-${pageFile.replace(".html", "")}`
  : {
      "index.html": "home",
      "kenelle.html": "audience",
      "ominaisuudet.html": "features",
      "prosessi.html": "process",
      "hinnat.html": "pricing",
      "luottamus.html": "trust",
      "yhteys.html": "contact"
    }[pageFile] || "home";

const metaTranslations = {
  home: {
    fi: {
      title: "SkriptLab - käsikirjoitustyön SaaS-työkalu",
      description: "SkriptLab jäsentää käsikirjoituksen rakenteen, kielen ja kehityskohdat selkeiksi havainnoiksi.",
      ogTitle: "SkriptLab",
      ogDescription: "Työkalu käsikirjoituksen analysointiin, jalostamiseen ja toimitustyön tueksi."
    },
    en: {
      title: "SkriptLab - manuscript and publishing material workspace",
      description: "SkriptLab helps writers and publishing professionals analyse, refine and prepare manuscripts and related materials.",
      ogTitle: "SkriptLab",
      ogDescription: "A workspace for analysing, refining and preparing manuscripts for the next stage."
    }
  },
  audience: {
    fi: {
      title: "Kenelle SkriptLab sopii - SkriptLab",
      description: "SkriptLab auttaa kirjoittajia, toimittajia, kääntäjiä, suunnittelijoita ja sisältötiimejä käsikirjoitustyössä."
    },
    en: {
      title: "Who SkriptLab is for - SkriptLab",
      description: "SkriptLab supports writers, editors, translators, designers and content teams working with manuscripts and publishing materials."
    }
  },
  features: {
    fi: {
      title: "Ominaisuudet - SkriptLab",
      description: "SkriptLab tuottaa käsikirjoituksesta analyysin, toimitussuunnitelman, synopsiksen, metadatan ja muita jatkotyön aineistoja."
    },
    en: {
      title: "Features - SkriptLab",
      description: "SkriptLab turns manuscripts into analyses, editing plans, synopses, metadata and other materials for the next stage of work."
    }
  },
  process: {
    fi: {
      title: "Työnkulku - SkriptLab",
      description: "SkriptLabin työnkulku käsikirjoituksen tuomisesta analyysiin, versiointiin ja jatkotyön aineistoihin."
    },
    en: {
      title: "Workflow - SkriptLab",
      description: "The SkriptLab workflow from importing a manuscript to analysis, revision and materials for further work."
    }
  },
  pricing: {
    fi: {
      title: "Hinnoittelu - SkriptLab",
      description: "SkriptLabin hinnoittelu alkaa demosta, pilotista tai kertatyöstä. Pyydä tarjous käsikirjoituksen oikolukuun, virhelistaukseen tai raakakäännökseen."
    },
    en: {
      title: "Pricing - SkriptLab",
      description: "Start with a demo, pilot or one-off project. Ask for a quote for manuscript review, proofreading support or a translation draft."
    }
  },
  trust: {
    fi: {
      title: "Tietosuoja ja luottamus - SkriptLab",
      description: "SkriptLab käsittelee käsikirjoituksia palvelun tuottamista varten EU-alueella. Oikeudet säilyvät tekijällä."
    },
    en: {
      title: "Trust and privacy - SkriptLab",
      description: "SkriptLab processes manuscript materials for providing the service. Rights remain with the author and service data is handled in the EU."
    }
  },
  contact: {
    fi: {
      title: "Yhteys ja demo - SkriptLab",
      description: "Pyydä demo SkriptLabista ja katso, miten käsikirjoituksen analyysi ja jatkotyön aineistot toimivat käytännössä."
    },
    en: {
      title: "Contact and demo - SkriptLab",
      description: "Request a SkriptLab demo and see how manuscript analysis and follow-up materials work in practice."
    }
  },
  "legal-privacy": {
    fi: { title: "Tietosuojaseloste - SkriptLab" },
    en: { title: "Privacy notice - SkriptLab" }
  },
  "legal-terms": {
    fi: { title: "Käyttöehdot - SkriptLab" },
    en: { title: "Terms of use - SkriptLab" }
  },
  "legal-cookies": {
    fi: { title: "Evästeet - SkriptLab" },
    en: { title: "Cookies - SkriptLab" }
  }
};

const commonTranslations = [
  { selector: ".skip-link", fi: "Siirry sisältöön", en: "Skip to content" },
  { selector: ".nav", attr: "aria-label", fi: "Päänavigaatio", en: "Main navigation" },
  { selector: ".site-header .logo", attr: "aria-label", fi: "SkriptLab etusivulle", en: "SkriptLab home" },
  { selector: ".nav-toggle", attr: "aria-label", fi: "Avaa valikko", en: "Open menu" },
  { selector: ".nav-links a[href='index.html']", fi: "Tuote", en: "Product" },
  { selector: ".nav-links a[href='kenelle.html']", fi: "Kenelle", en: "For whom" },
  { selector: ".nav-links a[href='ominaisuudet.html']", fi: "Ominaisuudet", en: "Features" },
  { selector: ".nav-links a[href='prosessi.html']", fi: "Työnkulku", en: "Workflow" },
  { selector: ".nav-links a[href='luottamus.html']", fi: "Tietosuoja", en: "Privacy" },
  { selector: ".nav-links a[href='hinnat.html']", fi: "Hinnoittelu", en: "Pricing" },
  { selector: ".nav-links a[href='yhteys.html']", fi: "Ota yhteyttä", en: "Contact" },
  { selector: ".btn-login", all: true, fi: "Kirjaudu", en: "Log in" },
  { selector: ".hero-links", attr: "aria-label", fi: "Sivuston osiot", en: "Site sections" },
  { selector: ".hero-links a[href='kenelle.html']", fi: "Kenelle", en: "For whom" },
  { selector: ".hero-links a[href='ominaisuudet.html']", fi: "Ominaisuudet", en: "Features" },
  { selector: ".hero-links a[href='prosessi.html']", fi: "Työnkulku", en: "Workflow" },
  { selector: ".hero-links a[href='luottamus.html']", fi: "Tietosuoja", en: "Privacy" },
  { selector: ".hero-links a[href='hinnat.html']", fi: "Hinnoittelu", en: "Pricing" },
  { selector: ".footer-brand p", fi: "Työkalu käsikirjoituksen analysointiin, jalostamiseen ja toimitustyön tueksi.", en: "A workspace for analysing, refining and preparing manuscripts for editorial work." },
  { selector: ".footer-top .footer-col:nth-child(2) h2", fi: "Tuote", en: "Product" },
  { selector: ".footer-top .footer-col:nth-child(2) a:nth-of-type(1)", fi: "Ominaisuudet", en: "Features" },
  { selector: ".footer-top .footer-col:nth-child(2) a:nth-of-type(2)", fi: "Työnkulku", en: "Workflow" },
  { selector: ".footer-top .footer-col:nth-child(2) a:nth-of-type(3)", fi: "Hinnoittelu", en: "Pricing" },
  { selector: ".footer-top .footer-col:nth-child(2) a:nth-of-type(4)", fi: "Demo", en: "Demo" },
  { selector: ".footer-top .footer-col:nth-child(3) h2", fi: "Käyttäjille", en: "For users" },
  { selector: ".footer-top .footer-col:nth-child(3) a:nth-of-type(1)", fi: "Kirjoittajat", en: "Writers" },
  { selector: ".footer-top .footer-col:nth-child(3) a:nth-of-type(2)", fi: "Toimitukset", en: "Editorial teams" },
  { selector: ".footer-top .footer-col:nth-child(3) a:nth-of-type(3)", fi: "Freelance-toimittajat", en: "Freelance editors" },
  { selector: ".footer-top .footer-col:nth-child(3) a:nth-of-type(4)", fi: "Kääntäjät", en: "Translators" },
  { selector: ".footer-top .footer-col:nth-child(4) h2", fi: "Yritys", en: "Company" },
  { selector: ".footer-top .footer-col:nth-child(4) a:nth-of-type(1)", fi: "Tietosuoja", en: "Privacy" },
  { selector: ".footer-top .footer-col:nth-child(4) a:nth-of-type(2)", fi: "Ota yhteyttä", en: "Contact" },
  { selector: ".footer-top .footer-col:nth-child(4) a:nth-of-type(3)", fi: "Käyttöehdot", en: "Terms of use" },
  { selector: ".footer-top .footer-col:nth-child(4) a:nth-of-type(4)", fi: "Tietosuojaseloste", en: "Privacy notice" },
  { selector: ".site-footer:not(.compact-footer) .footer-bottom span:first-child", fi: "© 2026 SkriptLab. Kaikki oikeudet pidätetään.", en: "© 2026 SkriptLab. All rights reserved." },
  { selector: ".site-footer:not(.compact-footer) .footer-bottom a[href='legal/privacy.html']", fi: "Tietosuojaseloste", en: "Privacy notice" },
  { selector: ".site-footer:not(.compact-footer) .footer-bottom a[href='legal/terms.html']", fi: "Käyttöehdot", en: "Terms of use" },
  { selector: ".site-footer:not(.compact-footer) .footer-bottom a[href='legal/cookies.html']", fi: "Evästeet", en: "Cookies" },
  { selector: ".compact-footer .footer-bottom span:first-child", fi: "© 2026 SkriptLab.", en: "© 2026 SkriptLab." },
  { selector: ".compact-footer .footer-bottom a[href='index.html']", fi: "Etusivu", en: "Home" },
  { selector: ".compact-footer .footer-bottom a[href='yhteys.html']", fi: "Yhteystiedot", en: "Contact" },
  { selector: ".compact-footer .footer-bottom a[href='legal/privacy.html']", fi: "Tietosuojaseloste", en: "Privacy notice" },
  { selector: ".compact-footer .footer-bottom a[href='legal/terms.html']", fi: "Käyttöehdot", en: "Terms of use" },
  { selector: "[data-close-login]", attr: "aria-label", fi: "Sulje kirjautumisikkuna", en: "Close login window" },
  { selector: ".modal-label", fi: "Kirjaudu", en: "Log in" },
  { selector: "#login-modal-title", fi: "Sovelluksen selainkäyttö työn alla", en: "Browser access is being prepared" },
  { selector: ".login-modal > p", fi: "Emme ota toistaiseksi uusia käyttäjiä.", en: "We are not opening new accounts just yet." },
  { selector: ".contact-form label[for='contact-email']", fi: "Sähköpostiosoitteesi", en: "Your email address" },
  { selector: "#contact-email", attr: "placeholder", fi: "nimi@example.com", en: "name@example.com" },
  { selector: ".contact-form label[for='contact-message']", fi: "Ota yhteyttä", en: "Contact us" },
  { selector: "#contact-message", attr: "placeholder", fi: "Kerro lyhyesti, mistä haluaisit kuulla lisää.", en: "Briefly tell us what you would like to hear more about." },
  { selector: ".contact-form .btn-primary", fi: "Lähetä sähköposti", en: "Send email" }
];

const pageTranslations = {
  home: [
    { selector: ".eyebrow", fi: "Käsikirjoitustyökalu kaikille", en: "Manuscript tools for every stage" },
    { selector: ".hero h1", fi: "Viimeistele käsikirjoituksesi", en: "Finish your manuscript with more clarity" },
    { selector: ".hero-sub", fi: "Kirja valmiiksi helpommin.", en: "Move your book closer to finished." },
    {
      selector: ".hero-desc",
      fi: "SkriptLab jäsentää käsikirjoituksen rakenteen, kielen ja kehityskohdat selkeiksi havainnoiksi. Voit kirjoittaa tai tuoda tekstisi suoraan palveluun, etkä tarvitse erillistä tekstieditoria tai taittotyökaluja. Saat analyysin, toimitussuunnitelman ja materiaalit jatkotyöhön. Kaikki oikeudet pysyvät tekijällä, aineistoa käsitellään ja säilytetään turvallisesti EU-alueella.",
      en: "SkriptLab turns the structure, language and development needs of a manuscript into clear editorial observations. You can write or import your text directly into the service, without a separate text editor or layout tool. You receive an analysis, an editing plan and materials for the next stage. Rights remain with the author, and material is handled and stored securely in the EU."
    },
    { selector: ".hero-actions .btn-primary", fi: "Pyydä demo", en: "Request a demo" },
    { selector: ".hero-actions .btn-ghost", fi: "Katso ominaisuudet", en: "View features" },
    { selector: ".hero-visual", attr: "aria-label", fi: "SkriptLab-sovelluksen esikatselu", en: "Preview of the SkriptLab application" },
    { selector: ".manuscript-preview small", fi: "Käsikirjoitus työn alla", en: "Manuscript in progress" },
    { selector: ".manuscript-preview h2", fi: "Käsikirjoitus · versio 1.3", en: "Manuscript · version 1.3" },
    { selector: ".manuscript-preview p", fi: "Katkelma tekstistä, josta SkriptLab tuottaa valitut aineistot jatkotyötä varten.", en: "A text excerpt that SkriptLab turns into selected materials for further work." },
    { selector: ".preview-actions", attr: "aria-label", fi: "Käsikirjoituksesta tuotettavat aineistot", en: "Materials produced from the manuscript" },
    { selector: ".preview-action:nth-child(1) strong", fi: "Analyysi", en: "Analysis" },
    { selector: ".preview-action:nth-child(1) span", fi: "Rakenne, rytmi, henkilöt, kieli ja kehityskohdat.", en: "Structure, rhythm, characters, language and development needs." },
    { selector: ".preview-action:nth-child(2) strong", fi: "Synopsis", en: "Synopsis" },
    { selector: ".preview-action:nth-child(2) span", fi: "Tiivistelmä, teemat, metadata ja jatkokäytön kuvaukset.", en: "Summary, themes, metadata and descriptions for later use." },
    { selector: ".preview-action:nth-child(3) strong", fi: "Viimeistely", en: "Final review" },
    { selector: ".preview-action:nth-child(3) span", fi: "Oikoluku, virhelistaus, korjausehdotukset ja tarkistuslista.", en: "Proofreading support, error list, correction suggestions and checklist." },
    { selector: ".preview-action:nth-child(4) strong", fi: "Taitto", en: "Layout" },
    { selector: ".preview-action:nth-child(4) span", fi: "Sivunäkymä, kuvituksen suunta ja tuotantoon valmistelu.", en: "Page view, visual direction and preparation for production." },
    { selector: ".preview-action:nth-child(5) strong", fi: "Käännökset ja selkokieliset versiot", en: "Translations and plain-language versions" },
    { selector: ".preview-action:nth-child(5) span", fi: "Käännösluonnokset, suomennokset ja selkeämmäksi mukautetut tekstiversiot.", en: "Translation drafts, Finnish versions and clearer adapted text versions." }
  ],
  audience: [
    { selector: ".section-label", fi: "Kenelle?", en: "For whom?" },
    { selector: ".section-title", fi: "Työkalu käsikirjoituksen käsittelyyn", en: "A workspace for working with manuscripts" },
    { selector: ".section-intro", fi: "SkriptLab auttaa muuttamaan pitkän tekstin selkeiksi aineistoiksi jatkotyötä varten: toimitukseen, käännökseen, visuaaliseen suunnitteluun, audioon ja teoksen viimeistelyyn.", en: "SkriptLab helps turn long-form text into clear materials for the next stage: editing, translation, visual planning, audio and final preparation." },
    { selector: ".grid .card:nth-child(1) h2", fi: "Kirjoittajille", en: "For writers" },
    { selector: ".grid .card:nth-child(1) p", fi: "Näe tekstin vahvuudet, ongelmakohdat, virheet ja seuraavat muokkausaskeleet.", en: "See the strengths, weak points, errors and next revision steps in your text." },
    { selector: ".grid .card:nth-child(2) h2", fi: "Toimittajille", en: "For editors" },
    { selector: ".grid .card:nth-child(2) p", fi: "Koosta analyysi, palauterunko, korjausehdotukset ja toimitussuunnitelma yhdestä käsikirjoituksesta.", en: "Create an analysis, feedback outline, correction suggestions and editing plan from one manuscript." },
    { selector: ".grid .card:nth-child(3) h2", fi: "Graafisille suunnittelijoille", en: "For visual designers" },
    { selector: ".grid .card:nth-child(3) p", fi: "Luo kansi- ja kuvitushahmotelmia sekä taittovedos suunnittelun pohjaksi.", en: "Draft cover and illustration directions and a layout proof to support design work." },
    { selector: ".grid .card:nth-child(4) h2", fi: "Kääntäjille", en: "For translators" },
    { selector: ".grid .card:nth-child(4) p", fi: "Tee raakakäännöksiä, termistöjä ja tiivistelmiä käännöstyön tueksi.", en: "Prepare translation drafts, terminology and summaries to support translation work." },
    { selector: ".grid .card:nth-child(5) h2", fi: "Audiotuottajille", en: "For audio producers" },
    { selector: ".grid .card:nth-child(5) p", fi: "Muodosta äänikäsikirjoitus, roolilistat ja ääntämisohjeet tuotantoa varten.", en: "Prepare an audio script, role lists and pronunciation notes for production." },
    { selector: ".grid .card:nth-child(6) h2", fi: "Sisältötiimeille", en: "For content teams" },
    { selector: ".grid .card:nth-child(6) p", fi: "Jaa havainnot, versiot, oikoluvun löydökset ja jatkotyöhön vietävät aineistot selkeästi.", en: "Share observations, versions, proofreading findings and materials for further work in a clear format." }
  ],
  features: [
    { selector: ".section-label", fi: "Ominaisuudet", en: "Features" },
    { selector: ".section-title", fi: "Mitä työkalulla voi tehdä?", en: "What can the workspace do?" },
    { selector: ".section-intro", fi: "SkriptLab tuottaa käsikirjoituksesta aineistoja, joita voi käyttää muokkauksessa, tarkistuksessa, suunnittelussa, käännöksessä ja tuotannossa. Voit kirjoittaa tai tuoda tekstin palveluun ja hoitaa työn ilman erillistä tekstieditoria tai taittotyökaluja.", en: "SkriptLab produces materials from a manuscript that can be used in revision, review, planning, translation and production. You can write or import the text into the service and continue the work without a separate text editor or layout tool." },
    { selector: ".grid .card:nth-child(1) h2", fi: "Käsikirjoitusanalyysi", en: "Manuscript analysis" },
    { selector: ".grid .card:nth-child(1) p", fi: "Rakenne, rytmi, henkilöt, teemat, toistot ja epäselvät kohdat.", en: "Structure, rhythm, characters, themes, repetition and unclear passages." },
    { selector: ".grid .card:nth-child(2) h2", fi: "Kirjoittaminen", en: "Writing" },
    { selector: ".grid .card:nth-child(2) p", fi: "Kirjoita, tuo ja jatka käsikirjoitusta samassa työtilassa ennen analyysiä ja toimitusta.", en: "Write, import and continue a manuscript in the same workspace before analysis and editing." },
    { selector: ".grid .card:nth-child(3) h2", fi: "Toimitussuunnitelma", en: "Editing plan" },
    { selector: ".grid .card:nth-child(3) p", fi: "Selkeät korjausehdotukset ja priorisoidut seuraavat tehtävät.", en: "Clear correction suggestions and prioritised next tasks." },
    { selector: ".grid .card:nth-child(4) h2", fi: "Virheiden etsintä", en: "Issue detection" },
    { selector: ".grid .card:nth-child(4) p", fi: "Kielen, jatkuvuuden, toiston ja epäselvien ilmausten tarkistus viimeistelyä varten.", en: "Checks for language, continuity, repetition and unclear phrasing before final review." },
    { selector: ".grid .card:nth-child(5) h2", fi: "Synopsis ja metadata", en: "Synopsis and metadata" },
    { selector: ".grid .card:nth-child(5) p", fi: "Tiivistelmät, kuvaukset, hakusanat, hahmolistat ja termistöt.", en: "Summaries, descriptions, keywords, character lists and terminology." },
    { selector: ".grid .card:nth-child(6) h2", fi: "Kansi ja kuvitus", en: "Cover and illustration" },
    { selector: ".grid .card:nth-child(6) p", fi: "Hahmotelmia visuaaliseksi suunnaksi, tunnelmaksi ja kuvamaailmaksi.", en: "Drafts for visual direction, mood and image world." },
    { selector: ".grid .card:nth-child(7) h2", fi: "Taittovedos", en: "Layout proof" },
    { selector: ".grid .card:nth-child(7) p", fi: "Ensimmäinen hahmotelma tekstin rakenteesta, kuvituksesta ja sivunäkymästä.", en: "An initial view of text structure, illustration placement and page layout." },
    { selector: ".grid .card:nth-child(8) h2", fi: "Raakakäännökset", en: "Translation drafts" },
    { selector: ".grid .card:nth-child(8) p", fi: "Käännöstyön tueksi tuotettavia luonnoksia, termejä ja kontekstia.", en: "Draft translations, terms and context to support translation work." },
    { selector: ".grid .card:nth-child(9) h2", fi: "Äänikäsikirjoitus", en: "Audio script" },
    { selector: ".grid .card:nth-child(9) p", fi: "Roolit, lukujako, ääntämisohjeet ja tuotantoon vietävä käsikirjoitus.", en: "Roles, reading sections, pronunciation notes and a script prepared for production." },
    { selector: ".grid .card:nth-child(10) h2", fi: "Viimeinen oikoluku", en: "Final proofreading support" },
    { selector: ".grid .card:nth-child(10) p", fi: "Tuki teoksen loppuviimeistelyyn ennen julkaisua, toimitusta tai muuta jatkokäyttöä.", en: "Support for the final review before publication, editorial handoff or another next step." },
    { selector: ".grid .card:nth-child(11) h2", html: true, fi: "Kuuntelu <span class=\"coming-soon\">Tulossa</span>", en: "Listening <span class=\"coming-soon\">Coming soon</span>" },
    { selector: ".grid .card:nth-child(11) p", fi: "Mahdollisuus kuunnella käsikirjoitusta työn alla ennen audiotuotantoa.", en: "A way to listen to the manuscript while it is still in progress, before audio production." }
  ],
  process: [
    { selector: ".section-label", fi: "Työnkulku", en: "Workflow" },
    { selector: ".section-title", fi: "Selkeät vaiheet", en: "Clear steps" },
    { selector: ".section-intro", fi: "Työkalu auttaa jäsentämään työn, löytämään tarkistettavat kohdat ja viemään tekstin kohti viimeistellympää versiota. Ihminen tekee päätökset.", en: "The workspace helps structure the work, identify what needs review and move the text toward a more finished version. The decisions stay with the human." },
    { selector: ".workflow-step:nth-child(1) h2", fi: "Tuo käsikirjoitus", en: "Import the manuscript" },
    { selector: ".workflow-step:nth-child(1) p", fi: "Lataa teksti ja valitse käsittelyn tavoite.", en: "Upload the text and choose the purpose of the work." },
    { selector: ".workflow-step:nth-child(2) h2", fi: "Saa analyysi", en: "Review the analysis" },
    { selector: ".workflow-step:nth-child(2) p", fi: "Näe vahvuudet, riskit, toistot, aukot ja korjauskohdat.", en: "See strengths, risks, repetition, gaps and areas for revision." },
    { selector: ".workflow-step:nth-child(3) h2", fi: "Tarkista virheet", en: "Check the issues" },
    { selector: ".workflow-step:nth-child(3) p", fi: "Etsi kieliasun, jatkuvuuden ja ilmaisun kohtia, jotka kaipaavat korjausta tai täsmennystä.", en: "Find language, continuity and phrasing issues that need correction or clarification." },
    { selector: ".workflow-step:nth-child(4) h2", fi: "Jalosta versiota", en: "Refine the version" },
    { selector: ".workflow-step:nth-child(4) p", fi: "Tee muutokset, hyödynnä parannusehdotuksia, kirjaa päätökset ja vertaa versioita.", en: "Make revisions, use improvement suggestions, record decisions and compare versions." },
    { selector: ".workflow-step:nth-child(5) h2", fi: "Vie jatkotyöhön", en: "Prepare for the next stage" },
    { selector: ".workflow-step:nth-child(5) p", fi: "Luo synopsis, raportti, metadata, toimitussuunnitelma tai viimeisen oikoluvun tarkistuslista.", en: "Create a synopsis, report, metadata, editing plan or final proofreading checklist." }
  ],
  pricing: [
    { selector: ".pricing-section .section-inner > .section-label", fi: "Hinnoittelu", en: "Pricing" },
    { selector: ".section-title", fi: "Aloita demolla tai pilotilla", en: "Start with a demo or pilot" },
    { selector: ".section-intro", fi: "Valitse kirjailijan, kääntäjän, tiimin tai rajatun pilotin tarpeisiin sopiva malli. Tarkat hinnat sovitaan käyttötarpeen mukaan.", en: "Choose a model for an author, translator, team or limited pilot. Exact pricing is agreed based on the intended use." },
    { selector: ".price-card:nth-child(1) h2", fi: "Kirjailija", en: "Writer" },
    { selector: ".price-card:nth-child(1) p", fi: "Yksittäisen käsikirjoituksen kehittämiseen ja viimeistelyyn.", en: "For developing and refining one manuscript." },
    { selector: ".price-card:nth-child(1) li:nth-child(1)", fi: "Käsikirjoitusanalyysi", en: "Manuscript analysis" },
    { selector: ".price-card:nth-child(1) li:nth-child(2)", fi: "Toimitussuunnitelma", en: "Editing plan" },
    { selector: ".price-card:nth-child(1) li:nth-child(3)", fi: "Synopsis ja tiivistelmät", en: "Synopsis and summaries" },
    { selector: ".price-card:nth-child(1) li:nth-child(4)", fi: "Versiokohtaiset havainnot", en: "Version-specific observations" },
    { selector: ".price-card:nth-child(2) h2", fi: "Kääntäjä", en: "Translator" },
    { selector: ".price-card:nth-child(2) p", fi: "Käännöstyön ja monikielisen tuotannon tueksi.", en: "For translation work and multilingual production." },
    { selector: ".price-card:nth-child(2) li:nth-child(1)", fi: "Raakakäännökset", en: "Translation drafts" },
    { selector: ".price-card:nth-child(2) li:nth-child(2)", fi: "Sanastot ja termistöt", en: "Glossaries and terminology" },
    { selector: ".price-card:nth-child(2) li:nth-child(3)", fi: "Monikielinen tuotanto", en: "Multilingual production" },
    { selector: ".price-card:nth-child(2) li:nth-child(4)", fi: "Kontekstin ja tyylin hahmotus", en: "Context and style mapping" },
    { selector: ".price-card:nth-child(3) h2", fi: "Tiimi", en: "Team" },
    { selector: ".price-card:nth-child(3) p", fi: "Toimitus- ja sisältötiimeille.", en: "For editorial and content teams." },
    { selector: ".price-card:nth-child(3) li:nth-child(1)", fi: "Useat käyttäjät", en: "Multiple users" },
    { selector: ".price-card:nth-child(3) li:nth-child(2)", fi: "Projektit ja työnkulut", en: "Projects and workflows" },
    { selector: ".price-card:nth-child(3) li:nth-child(3)", fi: "Raportit ja palautepohjat", en: "Reports and feedback templates" },
    { selector: ".price-card:nth-child(3) li:nth-child(4)", fi: "Organisaatiokohtaiset asetukset", en: "Organisation-specific settings" },
    { selector: ".price-card:nth-child(4) h2", fi: "Pilotti", en: "Pilot" },
    { selector: ".price-card:nth-child(4) p", fi: "Rajattu kokeilu omalla aineistolla.", en: "A limited trial with your own material." },
    { selector: ".price-card:nth-child(4) li:nth-child(1)", fi: "Demo ja käyttöönottokeskustelu", en: "Demo and onboarding discussion" },
    { selector: ".price-card:nth-child(4) li:nth-child(2)", fi: "Testiaineiston analyysi", en: "Test material analysis" },
    { selector: ".price-card:nth-child(4) li:nth-child(3)", fi: "Prosessin sovitus", en: "Workflow adaptation" },
    { selector: ".price-card:nth-child(4) li:nth-child(4)", fi: "Jatkokehityksen tiekartta", en: "Roadmap for further development" },
    { selector: ".one-off-pricing .section-label", fi: "Kertatyöt", en: "One-off projects" },
    { selector: "#kertatyot-title", fi: "Esimerkkihintoja yksittäisiin toimeksiantoihin", en: "Example pricing for individual assignments" },
    { selector: ".one-off-pricing > div > p:not(.section-label)", fi: "Jos et tarvitse jatkuvaa käyttöä, voit pyytää tarjouksen rajatusta työstä. Lopullinen hinta riippuu käsikirjoituksen pituudesta, tekstin kunnosta ja halutusta toimitustasosta.", en: "If you do not need ongoing access, you can ask for a quote for a limited assignment. The final price depends on manuscript length, text condition and the level of editorial support needed." },
    { selector: ".quote-card:nth-child(1) h3", fi: "Viimeinen oikoluku ja virhelistaus", en: "Final proofreading support and issue list" },
    { selector: ".quote-card:nth-child(1) p", fi: "Käsikirjoituksen viimeinen tarkistus, virheiden merkintä ja selkeä lista korjattavista kohdista.", en: "A final manuscript review, marked issues and a clear list of points to correct." },
    { selector: ".quote-card:nth-child(1) strong", fi: "Esimerkki: 50-100 €", en: "Example: €50-100" },
    { selector: ".quote-card:nth-child(1) span", fi: "Hinta vaihtelee teoksen pituuden mukaan.", en: "The price varies by manuscript length." },
    { selector: ".quote-card:nth-child(2) h3", fi: "Raakakäännöksen tekeminen", en: "Creating a translation draft" },
    { selector: ".quote-card:nth-child(2) p", fi: "Koko teoksen raakakäännös käännöstyön, toimituksen tai jatkoarvioinnin pohjaksi.", en: "A full-work translation draft as a basis for translation, editing or further evaluation." },
    { selector: ".quote-card:nth-child(2) strong", fi: "Esimerkki: 1-2 € / liuska", en: "Example: €1-2 / page" },
    { selector: ".quote-card:nth-child(2) span", fi: "300-sivuisen teoksen hinta on tyypillisesti muutamia satoja euroja.", en: "A 300-page work typically costs a few hundred euros." },
    { selector: ".one-off-pricing .btn-primary", fi: "Kysy tarjous", en: "Ask for a quote" },
    { selector: ".one-off-pricing .btn-primary", attr: "href", fi: "mailto:skriptlab@skriptlab.com?subject=Tarjouspyynt%C3%B6%20SkriptLabista", en: "mailto:skriptlab@skriptlab.com?subject=SkriptLab%20quote%20request" }
  ],
  trust: [
    { selector: ".section-label", fi: "Luottamus", en: "Trust" },
    { selector: ".section-title", fi: "Teksti pysyy tekijällä", en: "Your text remains yours" },
    { selector: ".section-intro", fi: "SkriptLab käsittelee aineistoa vain palvelun tuottamista varten. Palvelun oma backend, tietokanta, lokit ja varmuuskopiot sijaitsevat EU-alueella.", en: "SkriptLab processes material only to provide the service. The service backend, database, logs and backups are located in the EU." },
    { selector: ".trust-item:nth-child(1) strong", fi: "Oikeudet säilyvät tekijällä", en: "Rights remain with the author" },
    { selector: ".trust-item:nth-child(1) p", fi: "Käsikirjoituksen ja siihen liittyvän aineiston oikeudet eivät siirry SkriptLabille.", en: "Rights to the manuscript and related material do not transfer to SkriptLab." },
    { selector: ".trust-item:nth-child(2) strong", fi: "EU-palvelimet", en: "EU servers" },
    { selector: ".trust-item:nth-child(2) p", fi: "Käsikirjoitusaineistot, käyttäjädata ja varmuuskopiot käsitellään ja säilytetään EU-alueella.", en: "Manuscript materials, user data and backups are handled and stored in the EU." },
    { selector: ".trust-item:nth-child(3) strong", fi: "Emme kouluta malleja teksteilläsi", en: "Your texts are not used to train models" },
    { selector: ".trust-item:nth-child(3) p", fi: "Käsikirjoituksia tai niistä johdettuja tietoja ei käytetä tekoälymallien kouluttamiseen.", en: "Manuscripts or derived information are not used to train AI models." },
    { selector: ".trust-item:nth-child(4) strong", fi: "Aineisto poistetaan tilauksen päätyttyä", en: "Material is removed after the subscription ends" },
    { selector: ".trust-item:nth-child(4) p", fi: "Tekstejä ja teostietoja ei säilytetä tilauksen päättämisen jälkeen, ellei laki tai asiakkaan oma pyyntö muuta edellytä.", en: "Texts and work metadata are not retained after the subscription ends unless required by law or requested by the customer." }
  ],
  contact: [
    { selector: ".section-label", fi: "Ota yhteyttä", en: "Contact" },
    { selector: ".cta-section h1", html: true, fi: "Haluatko käsitellä <em>käsikirjoitusta</em> fiksummin?", en: "Want to work with your <em>manuscript</em> more clearly?" },
    { selector: ".cta-section .section-inner > p:not(.section-label):not(.cta-note)", fi: "Pyydä demo ja katso, miten SkriptLab jäsentää tekstin, havainnot ja jatkotyön.", en: "Request a demo and see how SkriptLab structures the text, findings and next steps." },
    { selector: ".cta-section .btn-primary", attr: "href", fi: "mailto:skriptlab@skriptlab.com?subject=Demo%20SkriptLabista", en: "mailto:skriptlab@skriptlab.com?subject=SkriptLab%20demo" },
    { selector: ".cta-note", fi: "Kaikki oikeudet pysyvät tekijällä. Tekstejä ei käytetä mallien kouluttamiseen. Aineistoa käsitellään ja säilytetään turvallisesti EU-alueella.", en: "All rights remain with the author. Texts are not used to train models. Material is handled and stored securely in the EU." }
  ],
  "legal-privacy": [
    { selector: ".legal-document h1", fi: "Tietosuojaseloste", en: "Privacy notice" },
    { selector: ".legal-document > p:nth-of-type(1)", fi: "SkriptLab käsittelee yhteydenottojen ja palvelun käytön yhteydessä annettuja tietoja palvelun tuottamista, asiakassuhteen hoitamista ja yhteydenottoihin vastaamista varten.", en: "SkriptLab processes information provided through contact requests and service use in order to provide the service, manage customer relationships and respond to enquiries." },
    { selector: ".legal-document h2:nth-of-type(1)", fi: "EU-käsittely ja säilytys", en: "EU processing and storage" },
    { selector: ".legal-document > p:nth-of-type(2)", fi: "Palvelun oma backend, tietokanta, lokit ja varmuuskopiot sijaitsevat EU-alueella. Käsikirjoitusaineistoja käsitellään ja säilytetään EU-palvelimilla palvelun tuottamista varten.", en: "The service backend, database, logs and backups are located in the EU. Manuscript materials are processed and stored on EU servers to provide the service." },
    { selector: ".legal-document h2:nth-of-type(2)", fi: "Käsikirjoitusaineistot", en: "Manuscript materials" },
    { selector: ".legal-document > p:nth-of-type(3)", fi: "Käsikirjoituksia käsitellään vain palvelun tuottamiseksi. Aineistoa ei käytetä tekoälymallien kouluttamiseen ilman erillistä lupaa, eikä käsikirjoitusten sisältöä kirjata sovelluslokeihin.", en: "Manuscripts are processed only to provide the service. Material is not used to train AI models without separate permission, and manuscript content is not written into application logs." },
    { selector: ".legal-document h2:nth-of-type(3)", fi: "Yhteydenotot", en: "Contact" },
    { selector: ".legal-document > p:nth-of-type(4)", html: true, fi: "Tietosuojaan liittyvissä kysymyksissä voit ottaa yhteyttä osoitteeseen <a href=\"mailto:skriptlab@skriptlab.com\">skriptlab@skriptlab.com</a>.", en: "For privacy-related questions, contact <a href=\"mailto:skriptlab@skriptlab.com\">skriptlab@skriptlab.com</a>." }
  ],
  "legal-terms": [
    { selector: ".legal-document h1", fi: "Käyttöehdot", en: "Terms of use" },
    { selector: ".legal-document > p:nth-of-type(1)", fi: "SkriptLab on käsikirjoitustyön tueksi tarkoitettu palvelu. Palvelun tuottamat havainnot ja ehdotukset ovat työskentelyn apuvälineitä, eivät julkaisu-, toimitus- tai oikeudellisia päätöksiä.", en: "SkriptLab is a service for supporting manuscript work. The observations and suggestions produced by the service are working aids, not publishing, editorial or legal decisions." },
    { selector: ".legal-document h2:nth-of-type(1)", fi: "Aineiston oikeudet", en: "Rights to material" },
    { selector: ".legal-document > p:nth-of-type(2)", fi: "Käyttäjä säilyttää oikeudet palveluun tuomaansa aineistoon. SkriptLab saa käsitellä aineistoa siinä laajuudessa kuin palvelun tuottaminen edellyttää.", en: "The user retains rights to material brought into the service. SkriptLab may process the material to the extent required to provide the service." },
    { selector: ".legal-document h2:nth-of-type(2)", fi: "EU-käsittely", en: "EU processing" },
    { selector: ".legal-document > p:nth-of-type(3)", fi: "Palvelun oma backend, tietokanta, lokit ja varmuuskopiot sijaitsevat EU-alueella. Käsikirjoitusaineistoja käsitellään ja säilytetään EU-palvelimilla palvelun tuottamista varten.", en: "The service backend, database, logs and backups are located in the EU. Manuscript materials are processed and stored on EU servers to provide the service." },
    { selector: ".legal-document h2:nth-of-type(3)", fi: "Yhteydenotot", en: "Contact" },
    { selector: ".legal-document > p:nth-of-type(4)", html: true, fi: "Käyttöehtoihin liittyvissä kysymyksissä voit ottaa yhteyttä osoitteeseen <a href=\"mailto:skriptlab@skriptlab.com\">skriptlab@skriptlab.com</a>.", en: "For questions about the terms of use, contact <a href=\"mailto:skriptlab@skriptlab.com\">skriptlab@skriptlab.com</a>." }
  ],
  "legal-cookies": [
    { selector: ".legal-document h1", fi: "Evästeet", en: "Cookies" },
    { selector: ".legal-document > p:nth-of-type(1)", fi: "SkriptLabin verkkosivu ei tällä hetkellä käytä evästeitä, analytiikkaevästeitä, markkinointipikseleitä tai muita vastaavia seurantateknologioita.", en: "The SkriptLab website currently does not use cookies, analytics cookies, marketing pixels or similar tracking technologies." },
    { selector: ".legal-document h2:nth-of-type(1)", fi: "Välttämättömät toiminnot", en: "Essential functionality" },
    { selector: ".legal-document > p:nth-of-type(2)", fi: "Sivu on staattinen verkkosivu, joka toimii ilman evästeitä. Selaimesi voi kuitenkin käsitellä tavanomaisia teknisiä tietoja sivun lataamista varten.", en: "The site is a static website and works without cookies. Your browser may still process ordinary technical information required to load the page." },
    { selector: ".legal-document h2:nth-of-type(2)", fi: "Muutokset", en: "Changes" },
    { selector: ".legal-document > p:nth-of-type(3)", fi: "Jos sivustolle lisätään myöhemmin analytiikkaa, kirjautumistoimintoja tai muita evästeitä hyödyntäviä palveluja, päivitämme tämän sivun ennen niiden käyttöönottoa.", en: "If analytics, login functionality or other services using cookies are added later, this page will be updated before they are introduced." },
    { selector: ".legal-document > p:nth-of-type(4)", html: true, fi: "Kysymyksissä voit ottaa yhteyttä osoitteeseen <a href=\"mailto:skriptlab@skriptlab.com\">skriptlab@skriptlab.com</a>.", en: "For questions, contact <a href=\"mailto:skriptlab@skriptlab.com\">skriptlab@skriptlab.com</a>." }
  ]
};

const navigationLabels = {
  home: { fi: "Tuote", en: "Product" },
  audience: { fi: "Kenelle", en: "Who it's for" },
  features: { fi: "Ominaisuudet", en: "Features" },
  process: { fi: "Työnkulku", en: "Workflow" },
  trust: { fi: "Tietosuoja", en: "Privacy" },
  pricing: { fi: "Hinnoittelu", en: "Pricing" },
  contact: { fi: "Ota yhteyttä", en: "Contact" }
};

function getNavigationKey(link) {
  const href = link.getAttribute("href") || "";

  if (href.includes("kenelle")) return "audience";
  if (href.includes("ominaisuudet")) return "features";
  if (href.includes("prosessi")) return "process";
  if (href.includes("luottamus")) return "trust";
  if (href.includes("hinnat")) return "pricing";
  if (href.includes("yhteys")) return "contact";
  if (href === "/" || href.includes("index") || href === "") return "home";

  return null;
}

function applyNavigationLabels(lang) {
  document.querySelectorAll(".nav-links a:not(.btn-login), .hero-links a").forEach((link) => {
    const key = getNavigationKey(link);
    const label = key ? navigationLabels[key]?.[lang] : null;

    if (label) {
      link.textContent = label;
    }
  });
}

function getSavedLanguage() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("lang");

  if (SUPPORTED_LANGUAGES.includes(requested)) {
    return requested;
  }

  try {
    const saved = window.localStorage.getItem(LANGUAGE_KEY);
    if (SUPPORTED_LANGUAGES.includes(saved)) {
      return saved;
    }
  } catch (error) {
    return "fi";
  }

  return "fi";
}

let currentLanguage = getSavedLanguage();

function createLanguageButton(extraClass = "") {
  const button = document.createElement("button");
  button.className = `lang-switch ${extraClass}`.trim();
  button.type = "button";
  button.dataset.languageToggle = "true";
  button.innerHTML = `
    <span data-lang-code="fi">FI</span>
    <span class="lang-separator" aria-hidden="true">/</span>
    <span data-lang-code="en">EN</span>
  `;
  button.addEventListener("click", () => {
    setLanguage(currentLanguage === "fi" ? "en" : "fi");
    setMenuOpen(false);
  });
  return button;
}

function ensureLanguageToggle() {
  const menu = document.querySelector("#site-menu");
  if (menu && !menu.querySelector("[data-language-toggle]")) {
    const item = document.createElement("li");
    item.className = "language-switch-item";
    item.appendChild(createLanguageButton());

    const loginItem = menu.querySelector(".btn-login")?.closest("li");
    menu.insertBefore(item, loginItem || null);
  }

  const legalDocument = document.querySelector(".legal-document");
  const legalLogo = legalDocument?.querySelector(".logo");
  if (legalDocument && legalLogo && !legalDocument.querySelector("[data-language-toggle]")) {
    const header = document.createElement("div");
    header.className = "legal-header-row";
    legalDocument.insertBefore(header, legalLogo);
    header.appendChild(legalLogo);
    header.appendChild(createLanguageButton("legal-language-switch"));
  }
}

function applyEntry(entry, lang) {
  const elements = entry.all
    ? document.querySelectorAll(entry.selector)
    : [document.querySelector(entry.selector)];

  elements.forEach((element) => {
    if (!element) return;
    const value = entry[lang];
    if (typeof value !== "string") return;

    if (entry.attr) {
      element.setAttribute(entry.attr, value);
    } else if (entry.html) {
      element.innerHTML = value;
    } else {
      element.textContent = value;
    }
  });
}

function applyMeta(lang) {
  const meta = metaTranslations[pageKey]?.[lang];
  if (!meta) return;

  if (meta.title) {
    document.title = meta.title;
  }

  const description = document.querySelector("meta[name='description']");
  if (description && meta.description) {
    description.setAttribute("content", meta.description);
  }

  const ogTitle = document.querySelector("meta[property='og:title']");
  if (ogTitle && (meta.ogTitle || meta.title)) {
    ogTitle.setAttribute("content", meta.ogTitle || meta.title);
  }

  const ogDescription = document.querySelector("meta[property='og:description']");
  if (ogDescription && (meta.ogDescription || meta.description)) {
    ogDescription.setAttribute("content", meta.ogDescription || meta.description);
  }
}

function updateLanguageButtons(lang) {
  document.querySelectorAll("[data-language-toggle]").forEach((button) => {
    button.setAttribute("aria-label", lang === "fi" ? "Switch to English" : "Vaihda suomeksi");
    button.setAttribute("title", lang === "fi" ? "Switch to English" : "Vaihda suomeksi");
    button.setAttribute("aria-pressed", lang === "en" ? "true" : "false");

    button.querySelectorAll("[data-lang-code]").forEach((label) => {
      label.classList.toggle("is-active", label.dataset.langCode === lang);
    });
  });
}

function setLanguage(lang) {
  if (!SUPPORTED_LANGUAGES.includes(lang)) return;

  currentLanguage = lang;
  document.documentElement.lang = lang;
  document.body.dataset.language = lang;

  try {
    window.localStorage.setItem(LANGUAGE_KEY, lang);
  } catch (error) {
    // Language switching still works for the current page even if storage is unavailable.
  }

  applyMeta(lang);
  [...commonTranslations, ...(pageTranslations[pageKey] || [])].forEach((entry) => applyEntry(entry, lang));
  applyNavigationLabels(lang);
  updateLanguageButtons(lang);
}

const toggle = document.querySelector(".nav-toggle");
const menu = document.querySelector("#site-menu");
const loginLinks = document.querySelectorAll(".btn-login[href=\"#login\"]");

function setMenuOpen(isOpen) {
  if (!toggle || !menu) return;

  toggle.setAttribute("aria-expanded", String(isOpen));
  toggle.setAttribute("aria-label", isOpen
    ? (currentLanguage === "en" ? "Close menu" : "Sulje valikko")
    : (currentLanguage === "en" ? "Open menu" : "Avaa valikko"));
  menu.classList.toggle("is-open", isOpen);
  document.body.classList.toggle("nav-open", isOpen);
}

if (toggle && menu) {
  toggle.addEventListener("click", () => {
    const isOpen = toggle.getAttribute("aria-expanded") === "true";
    setMenuOpen(!isOpen);
  });

  menu.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      setMenuOpen(false);
    }
  });
}

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
  const body = currentLanguage === "en"
    ? [
        "Hello SkriptLab,",
        "",
        message || "I would like to hear more about SkriptLab.",
        "",
        email ? `My reply address: ${email}` : ""
      ].filter(Boolean).join("\n")
    : [
        "Hei SkriptLab,",
        "",
        message || "Haluaisin kuulla lisää SkriptLabista.",
        "",
        email ? `Vastausosoitteeni: ${email}` : ""
      ].filter(Boolean).join("\n");

  const subject = currentLanguage === "en" ? "SkriptLab enquiry" : "Yhteydenotto SkriptLabista";
  window.location.href = `mailto:skriptlab@skriptlab.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMenuOpen(false);
    closeLoginModal();
  }
});

ensureLanguageToggle();
setLanguage(currentLanguage);

const LANGUAGE_KEY = "skriptlab_site_language";
const SUPPORTED_LANGUAGES = ["fi", "en"];

const pathParts = window.location.pathname.split("/").filter(Boolean);
const pageSlug = (pathParts[pathParts.length - 1] || "index").replace(/\.html$/, "");

const pageKey = window.location.pathname.includes("/legal/")
  ? `legal-${pageSlug}`
  : ({
      index: "home",
      kenelle: "audience",
      ominaisuudet: "features",
      prosessi: "process",
      hinnat: "pricing",
      luottamus: "trust",
      yhteys: "contact"
    }[pageSlug] || (pathParts.includes("ominaisuudet") ? `feature-${pageSlug}` : "home"));

const metaTranslations = {
  home: {
    fi: {
      title: "SkriptLab - kirjoita, editoi, oikolue ja käännä",
      description: "SkriptLab on käsikirjoitusohjelmisto kirjoittamiseen, editointiin, oikolukuun ja kieliversioiden tekemiseen.",
      ogTitle: "SkriptLab",
      ogDescription: "Kirjoita, editoi, oikolue ja tee kieliversiot samassa käsikirjoitustyötilassa."
    },
    en: {
      title: "SkriptLab - write, edit, proofread and translate",
      description: "SkriptLab is manuscript software for writing, editing, proofreading and creating language versions.",
      ogTitle: "SkriptLab",
      ogDescription: "Write, edit, proofread and create language versions in one manuscript workspace."
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
      title: "Ominaisuudet - käsikirjoituksen analyysi, editointi ja viimeistely | SkriptLab",
      description: "Tutustu SkriptLabin työkaluihin käsikirjoituksen analyysiin, rakenteeseen, editointiin, käännöksiin, oikolukuun, kuvitukseen ja taittoon."
    },
    en: {
      title: "Features - manuscript analysis, editing and preparation | SkriptLab",
      description: "Explore SkriptLab tools for manuscript analysis, structure, editing, translation, proofreading, cover planning and layout preparation."
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
      description: "SkriptLab-ohjelmiston hinta perustuu tekstimäärään, valittuihin toimintoihin ja kieliversioiden määrään. Katso 300-sivuisen teoksen esimerkkihinta."
    },
    en: {
      title: "Pricing - SkriptLab",
      description: "SkriptLab software pricing is based on text volume, selected tools and the number of language versions. See an example for a 300-page work."
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
  { selector: ".footer-brand p", fi: "Käsikirjoitusohjelmisto kirjoittamiseen, editointiin, oikolukuun ja kieliversioihin.", en: "Manuscript software for writing, editing, proofreading and language versions." },
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
  { selector: ".site-footer:not(.compact-footer) .footer-bottom span:first-child", fi: "© 2026 SkriptLab. Kaikki oikeudet pidätetään. SkriptLab Oy · Y-tunnus 3588291-2 · Helsinki.", en: "© 2026 SkriptLab. All rights reserved. SkriptLab Oy · Business ID 3588291-2 · Helsinki, Finland." },
  { selector: ".site-footer:not(.compact-footer) .footer-bottom a:nth-of-type(1)", fi: "Tietosuojaseloste", en: "Privacy notice" },
  { selector: ".site-footer:not(.compact-footer) .footer-bottom a:nth-of-type(2)", fi: "Käyttöehdot", en: "Terms of use" },
  { selector: ".site-footer:not(.compact-footer) .footer-bottom a:nth-of-type(3)", fi: "Evästeet", en: "Cookies" },
  { selector: ".compact-footer .footer-bottom span:first-child", fi: "© 2026 SkriptLab. SkriptLab Oy · Y-tunnus 3588291-2 · Helsinki.", en: "© 2026 SkriptLab. SkriptLab Oy · Business ID 3588291-2 · Helsinki, Finland." },
  { selector: ".compact-footer .footer-bottom a:nth-of-type(1)", fi: "Etusivu", en: "Home" },
  { selector: ".compact-footer .footer-bottom a:nth-of-type(2)", fi: "Yhteystiedot", en: "Contact" },
  { selector: ".compact-footer .footer-bottom a:nth-of-type(3)", fi: "Tietosuojaseloste", en: "Privacy notice" },
  { selector: ".compact-footer .footer-bottom a:nth-of-type(4)", fi: "Käyttöehdot", en: "Terms of use" },
  { selector: "[data-close-login]", attr: "aria-label", fi: "Sulje kirjautumisikkuna", en: "Close login window" },
  { selector: ".modal-label", fi: "Kirjaudu", en: "Log in" },
  { selector: "#login-modal-title", fi: "Sovelluksen selainkäyttö työn alla", en: "Browser access is being prepared" },
  { selector: ".login-modal > p", fi: "Emme ota toistaiseksi uusia käyttäjiä.", en: "We are not opening new accounts just yet." },
  { selector: ".login-modal .contact-form label[for='contact-email']", fi: "Sähköpostiosoitteesi", en: "Your email address" },
  { selector: "#contact-email", attr: "placeholder", fi: "nimi@example.com", en: "name@example.com" },
  { selector: ".login-modal .contact-form label[for='contact-message']", fi: "Ota yhteyttä", en: "Contact us" },
  { selector: "#contact-message", attr: "placeholder", fi: "Kerro lyhyesti, mistä haluaisit kuulla lisää.", en: "Briefly tell us what you would like to hear more about." },
  { selector: ".login-modal .contact-form .btn-primary", fi: "Siirry yhteydenottoon", en: "Go to contact form" }
];

const pageTranslations = {
  home: [
    { selector: ".eyebrow", fi: "Käsikirjoitusohjelmisto", en: "Manuscript software" },
    { selector: ".hero h1", fi: "Kirjoita, editoi, oikolue ja käännä", en: "Write, edit, proofread and translate" },
    { selector: ".hero-sub", fi: "Koko käsikirjoitustyö yhdessä sovelluksessa.", en: "Your complete manuscript workflow in one application." },
    {
      selector: ".hero-desc",
      fi: "Aloita tyhjästä tai tuo valmis teksti. Työstä käsikirjoitusta luku kerrallaan, hyväksy vain haluamasi muutokset, tarkista kieli ja tee rinnakkaiset kieliversiot. Sinä teet työn ja päätökset – SkriptLab antaa työkalut.",
      en: "Start from a blank page or import an existing text. Work chapter by chapter, accept only the changes you want, check the language and create parallel language versions. You do the work and make the decisions – SkriptLab provides the tools."
    },
    { selector: ".hero-actions .btn-primary", fi: "Pyydä käyttöoikeus", en: "Request access" },
    { selector: ".hero-actions .btn-ghost", fi: "Tutustu toimintoihin", en: "Explore the tools" },
    { selector: ".core-actions", attr: "aria-label", fi: "SkriptLabin perustoiminnot", en: "Core SkriptLab tools" },
    { selector: ".core-actions li:nth-child(1)", fi: "Kirjoita", en: "Write" },
    { selector: ".core-actions li:nth-child(2)", fi: "Editoi", en: "Edit" },
    { selector: ".core-actions li:nth-child(3)", fi: "Oikolue", en: "Proofread" },
    { selector: ".core-actions li:nth-child(4)", fi: "Käännä", en: "Translate" },
    { selector: ".hero-trust", fi: "Tekstin oikeudet säilyvät sinulla. Palvelun oma data käsitellään EU-alueella.", en: "You retain the rights to your text. The service's own data is processed in the EU." },
    { selector: ".product-shot-label", fi: "Aito näkymä SkriptLabista", en: "A real view of SkriptLab" },
    { selector: ".product-shot-bar strong", fi: "Kirjoita ja editoi", en: "Write and edit" },
    { selector: ".product-shot img", attr: "alt", fi: "SkriptLabin kirjoitus- ja editointinäkymä: kirjamuisti, käsikirjoitus ja oikolukutehtävät rinnakkain.", en: "SkriptLab writing and editing view with manuscript memory, the text and proofreading tasks side by side." },
    { selector: ".product-shot figcaption", fi: "Kirjoita tekstiä, pidä teoksen tiedot mukana ja oikolue valitsemasi osio.", en: "Write your text, keep the work's details close and proofread the section you choose." }
  ],
  audience: [
    { selector: ".section-label", fi: "Kenelle?", en: "For whom?" },
    { selector: ".section-title", fi: "Työkalu käsikirjoituksen käsittelyyn", en: "A workspace for working with manuscripts" },
    { selector: ".section-intro", fi: "SkriptLab auttaa muuttamaan pitkän tekstin selkeiksi aineistoiksi jatkotyötä varten: toimitukseen, käännökseen, visuaaliseen suunnitteluun, audioon ja teoksen viimeistelyyn.", en: "SkriptLab helps turn long-form text into clear materials for the next stage: editing, translation, visual planning, audio and final preparation." },
    { selector: ".grid .card:nth-child(1) h2", fi: "Kirjoittajille", en: "For writers" },
    { selector: ".grid .card:nth-child(1) p", fi: "Näe tekstin vahvuudet, ongelmakohdat, virheet ja seuraavat muokkausaskeleet.", en: "See the strengths, weak points, errors and next revision steps in your text." },
    { selector: ".grid .card:nth-child(2) h2", fi: "Toimittajille", en: "For editors" },
    { selector: ".grid .card:nth-child(2) p", fi: "Koosta analyysi, palauterunko, korjausehdotukset ja toimitussuunnitelma yhdestä käsikirjoituksesta.", en: "Create an analysis, feedback outline, correction suggestions and editing plan from one manuscript." },
    { selector: ".grid .card:nth-child(3) h2", fi: "Taittajille", en: "For layout designers" },
    { selector: ".grid .card:nth-child(3) p", fi: "Luo kansi- ja kuvitushahmotelmia sekä taittovedos suunnittelun pohjaksi.", en: "Draft cover and illustration directions and a layout proof to support design work." },
    { selector: ".grid .card:nth-child(4) h2", fi: "Kääntäjille", en: "For translators" },
    { selector: ".grid .card:nth-child(4) p", fi: "Tee raakakäännöksiä jatkotyön pohjaksi tai tarkastettuja käännöksiä lähdetekstiin vertaamalla. Hyödynnä lisäksi termistöjä ja tiivistelmiä.", en: "Prepare translation drafts for further work or source-checked translations. Use glossaries and summaries to support the process." },
    { selector: ".grid .card:nth-child(5) h2", fi: "Audiotuottajille", en: "For audio producers" },
    { selector: ".grid .card:nth-child(5) p", fi: "Muodosta äänikäsikirjoitus, roolilistat ja ääntämisohjeet tuotantoa varten.", en: "Prepare an audio script, role lists and pronunciation notes for production." },
    { selector: ".grid .card:nth-child(6) h2", fi: "Sisältötiimeille", en: "For content teams" },
    { selector: ".grid .card:nth-child(6) p", fi: "Jaa havainnot, versiot, oikoluvun löydökset ja jatkotyöhön vietävät aineistot selkeästi.", en: "Share observations, versions, proofreading findings and materials for further work in a clear format." }
  ],
  features: [
    { selector: ".section-label", fi: "Ominaisuudet", en: "Features" },
    { selector: ".section-title", fi: "Yksi työtila käsikirjoituksen eri vaiheisiin", en: "One workspace for every manuscript stage" },
    { selector: ".section-intro", fi: "SkriptLab auttaa siirtymään luonnoksesta kohti viimeisteltyä käsikirjoitusta ja julkaisuaineistoja. Valitse alta työvaihe, josta haluat tietää tarkemmin.", en: "SkriptLab helps you move from a draft toward a refined manuscript and publishing materials. Choose a stage below to explore it in more detail." },
    { selector: ".feature-card:nth-child(1) h2", fi: "Analyysi ja rakenne", en: "Analysis and structure" },
    { selector: ".feature-card:nth-child(1) p", fi: "Tunnista kokonaisuuden vahvuudet, kehityskohdat ja nykyinen osiorakenne.", en: "Identify the work's strengths, development needs and existing section structure." },
    { selector: ".feature-card:nth-child(1) .card-link", fi: "Tutustu käsikirjoitusanalyysiin", en: "Explore manuscript analysis" },
    { selector: ".feature-card:nth-child(2) h2", fi: "Kirjoittaminen ja editointi", en: "Writing and editing" },
    { selector: ".feature-card:nth-child(2) p", fi: "Työstä tekstiä osio kerrallaan ja hyödynnä kohdennettuja muutosehdotuksia.", en: "Work section by section and use focused revision suggestions." },
    { selector: ".feature-card:nth-child(2) .card-link", fi: "Tutustu tekstin työstämiseen", en: "Explore writing and editing" },
    { selector: ".feature-card:nth-child(3) h2", fi: "Oikoluku ja viimeistely", en: "Proofreading and final review" },
    { selector: ".feature-card:nth-child(3) p", fi: "Tarkista luvut yksi kerrallaan ja hyväksy vain tarpeelliset korjaukset.", en: "Review chapters one at a time and accept only the corrections you need." },
    { selector: ".feature-card:nth-child(3) .card-link", fi: "Tutustu viimeistelyyn", en: "Explore final review" },
    { selector: ".feature-card:nth-child(4) h2", fi: "Oheisaineistot", en: "Supporting materials" },
    { selector: ".feature-card:nth-child(4) p", fi: "Valmistele nimiölehti, sisällysluettelo, lähteet, hakemistot ja muut kirjan osat.", en: "Prepare title pages, contents, references, indexes and other book sections." },
    { selector: ".feature-card:nth-child(4) .card-link", fi: "Tutustu oheisaineistoihin", en: "Explore supporting materials" },
    { selector: ".feature-card:nth-child(5) h2", fi: "Kansi ja kuvitus", en: "Cover and illustration" },
    { selector: ".feature-card:nth-child(5) p", fi: "Suunnittele etu- ja takakansi sekä kuvamaailma käsikirjoituksen tietojen pohjalta.", en: "Plan front and back covers and a visual direction using manuscript context." },
    { selector: ".feature-card:nth-child(5) .card-link", fi: "Tutustu visuaaliseen suunnitteluun", en: "Explore visual planning" },
    { selector: ".feature-card:nth-child(6) h2", fi: "Taitto ja valmis kirja", en: "Layout and finished book" },
    { selector: ".feature-card:nth-child(6) p", fi: "Tarkastele kokonaisuutta lukutilassa ja valmistele tiedostot seuraavaan tuotantovaiheeseen.", en: "Read the complete work and prepare files for the next production stage." },
    { selector: ".feature-card:nth-child(6) .card-link", fi: "Tutustu kirjan valmisteluun", en: "Explore book preparation" },
    { selector: ".feature-card:nth-child(7) h2", fi: "Käännökset", en: "Translations" },
    { selector: ".feature-card:nth-child(7) p", fi: "Käännä pitkä teos hallittuina paloina ja tarkasta lähde sekä käännös rinnakkain.", en: "Translate a long work in controlled segments and compare source and translation side by side." },
    { selector: ".feature-card:nth-child(7) .card-link", fi: "Tutustu käännöstyöhön", en: "Explore translation work" },
    { selector: ".feature-card:nth-child(8) h2", fi: "Elämäkerta", en: "Biography" },
    { selector: ".feature-card:nth-child(8) p", fi: "Muuta muistot, dokumentit ja haastatteluvastaukset jäsennellyksi elämäntarinaksi vaihe vaiheelta.", en: "Turn memories, documents and interview answers into a structured life story, step by step." },
    { selector: ".feature-card:nth-child(8) .card-link", fi: "Tutustu elämäkertatyöhön", en: "Explore biography work" }
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
    { selector: ".section-title", fi: "Ohjelmiston hinta tekstimäärän mukaan", en: "Software pricing based on text volume" },
    { selector: ".section-intro", fi: "Maksat SkriptLabin käyttöoikeudesta ja valitusta käsittelymäärästä. Kirjoitat, editoit, oikoluet ja teet kieliversiot itse sovelluksessa.", en: "You pay for access to SkriptLab and the selected processing volume. You write, edit, proofread and create language versions yourself in the application." },
    { selector: ".price-card:nth-child(1) .price-model", fi: "Teoskohtainen", en: "Per work" },
    { selector: ".price-card:nth-child(1) h2", fi: "Yksi käsikirjoitus", en: "One manuscript" },
    { selector: ".price-card:nth-child(1) p", fi: "Hinta muodostuu tekstimäärästä ja käyttöön valituista työkaluista.", en: "Pricing is based on text volume and the tools you select." },
    { selector: ".price-card:nth-child(1) li:nth-child(1)", fi: "Sana- ja merkkimäärä", en: "Word and character count" },
    { selector: ".price-card:nth-child(1) li:nth-child(2)", fi: "Kirjoitus ja editointi", en: "Writing and editing" },
    { selector: ".price-card:nth-child(1) li:nth-child(3)", fi: "Valitut oikolukukierrokset", en: "Selected proofreading rounds" },
    { selector: ".price-card:nth-child(1) li:nth-child(4)", fi: "Versiot ja tiedostoviennit", en: "Versions and file exports" },
    { selector: ".price-card:nth-child(2) .price-model", fi: "Kieliversiot", en: "Language versions" },
    { selector: ".price-card:nth-child(2) h2", fi: "Yksi tai useampi kieli", en: "One or more languages" },
    { selector: ".price-card:nth-child(2) p", fi: "Hinta määräytyy lähdetekstin pituuden ja kieliversioiden määrän mukaan.", en: "Pricing is based on source text length and the number of language versions." },
    { selector: ".price-card:nth-child(2) li:nth-child(1)", fi: "Valitut kohdekielet", en: "Selected target languages" },
    { selector: ".price-card:nth-child(2) li:nth-child(2)", fi: "Lähdevertailu per versio", en: "Source comparison per version" },
    { selector: ".price-card:nth-child(2) li:nth-child(3)", fi: "Oikolukukierros per versio", en: "Proofreading round per version" },
    { selector: ".price-card:nth-child(2) li:nth-child(4)", fi: "Muokkaus ja vienti", en: "Editing and export" },
    { selector: ".price-card:nth-child(3) .price-model", fi: "Kuukausikäyttö", en: "Monthly access" },
    { selector: ".price-card:nth-child(3) h2", fi: "Tiimi", en: "Team" },
    { selector: ".price-card:nth-child(3) p", fi: "Jatkuva käyttö usealle käyttäjälle ja käsikirjoitukselle.", en: "Ongoing access for multiple users and manuscripts." },
    { selector: ".price-card:nth-child(3) li:nth-child(1)", fi: "Käyttäjien määrä", en: "Number of users" },
    { selector: ".price-card:nth-child(3) li:nth-child(2)", fi: "Projektien määrä", en: "Number of projects" },
    { selector: ".price-card:nth-child(3) li:nth-child(3)", fi: "Yhteiset asetukset", en: "Shared settings" },
    { selector: ".price-card:nth-child(3) li:nth-child(4)", fi: "Sovitut kuukausirajat", en: "Agreed monthly limits" },
    { selector: ".price-card:nth-child(4) .price-model", fi: "30 päivää", en: "30 days" },
    { selector: ".price-card:nth-child(4) h2", fi: "Pilotti", en: "Pilot" },
    { selector: ".price-card:nth-child(4) p", fi: "Rajattu kokeilu omalla aineistolla ennen jatkuvaa käyttöä.", en: "A limited trial with your own material before ongoing use." },
    { selector: ".price-card:nth-child(4) li:nth-child(1)", fi: "Sovittu tekstimäärä", en: "Agreed text volume" },
    { selector: ".price-card:nth-child(4) li:nth-child(2)", fi: "Valitut työkalut", en: "Selected tools" },
    { selector: ".price-card:nth-child(4) li:nth-child(3)", fi: "Oma käsikirjoitus", en: "Your own manuscript" },
    { selector: ".price-card:nth-child(4) li:nth-child(4)", fi: "Selkeä jatkopäätös", en: "A clear next-step decision" },
    { selector: ".example-pricing .section-label", fi: "Esimerkkiprojekti", en: "Example project" },
    { selector: "#esimerkkiprojekti-title", fi: "300-sivuinen teos, kolme kieliversiota", en: "A 300-page work, three language versions" },
    { selector: ".example-pricing > div:first-child > p:not(.section-label)", fi: "Sivumäärä havainnollistaa laajuutta. Hinta lasketaan sanoista ja merkeistä.", en: "The page count illustrates scope. Pricing is calculated from words and characters." },
    { selector: ".project-metrics", attr: "aria-label", fi: "Esimerkkiteoksen laajuus", en: "Example work size" },
    { selector: ".project-metrics span:nth-child(1) strong", fi: "noin 300", en: "about 300" },
    { selector: ".project-metrics span:nth-child(1) small", fi: "sivua", en: "pages" },
    { selector: ".project-metrics span:nth-child(2) small", fi: "sanaa", en: "words" },
    { selector: ".project-metrics span:nth-child(3) strong", fi: "enintään 450 000", en: "up to 450,000" },
    { selector: ".project-metrics span:nth-child(3) small", fi: "merkkiä välilyönteineen", en: "characters including spaces" },
    { selector: ".estimate-summary div > span", fi: "Monikielinen teospaketti", en: "Multilingual work package" },
    { selector: ".estimate-summary div > small", fi: "Esimerkkihinta ohjelmiston käytölle", en: "Example price for software use" },
    { selector: ".estimate-breakdown div:nth-child(1) dt", fi: "Lähdetekstin analyysi ja teoskohtainen käyttöoikeus", en: "Source text analysis and per-work software access" },
    { selector: ".estimate-breakdown div:nth-child(2) dt", fi: "Kolme käyttäjän valitsemaa kieliversiota", en: "Three language versions selected by the user" },
    { selector: ".estimate-breakdown div:nth-child(3) dt", fi: "Lähdevertailu ja oikolukukierros jokaiseen versioon", en: "Source comparison and proofreading round for each version" },
    { selector: ".estimate-includes", fi: "Pakettiin sisältyvät versioiden muokkaus ja tiedostoviennit SkriptLabissa.", en: "The package includes editing the versions and exporting files in SkriptLab." },
    { selector: ".software-pricing-note", attr: "aria-label", fi: "Hinnoittelun rajaus", en: "Pricing scope" },
    { selector: ".software-pricing-note strong", fi: "Ohjelmisto, ei käännös- tai oikolukupalvelu.", en: "Software, not a translation or proofreading service." },
    { selector: ".software-pricing-note p", fi: "Hinta koskee SkriptLabin käyttöoikeutta ja yllä kuvattuja automaattisia käsittelyajoja. Käyttäjä tai hänen valitsemansa kieliasiantuntija tarkastaa ja hyväksyy lopputuloksen ennen julkaisua.", en: "The price covers access to SkriptLab and the automated processing runs described above. The user or a language specialist chosen by them reviews and approves the result before publication." },
    { selector: ".example-pricing .btn-primary", fi: "Pyydä käyttöoikeus", en: "Request access" }
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
    { selector: ".cta-section .section-inner > p:not(.section-label):not(.cta-note)", fi: "Pyydä demo, tarjous tai lisätietoja. Kerro lyhyesti, millaisen aineiston tai työnkulun parissa työskentelet, niin palaamme asiaan.", en: "Request a demo, quote or more information. Briefly describe the material or workflow you are working with, and we will get back to you." },
    { selector: ".contact-page-form label[for='contact-page-name']", fi: "Nimi", en: "Name" },
    { selector: ".contact-page-form label[for='contact-page-email']", fi: "Sähköposti", en: "Email" },
    { selector: ".contact-page-form label[for='contact-page-interest']", fi: "Mistä olet kiinnostunut?", en: "What are you interested in?" },
    { selector: "#contact-page-interest option:nth-child(1)", fi: "Valitse aihe", en: "Choose a topic" },
    { selector: "#contact-page-interest option:nth-child(2)", fi: "Demo", en: "Demo" },
    { selector: "#contact-page-interest option:nth-child(3)", fi: "Käsikirjoitusanalyysi", en: "Manuscript analysis" },
    { selector: "#contact-page-interest option:nth-child(4)", fi: "Käännökset tai suomennos", en: "Translations or Finnish translation" },
    { selector: "#contact-page-interest option:nth-child(5)", fi: "Julkaisuaineistot", en: "Publishing materials" },
    { selector: "#contact-page-interest option:nth-child(6)", fi: "Tiimi- tai yrityskäyttö", en: "Team or business use" },
    { selector: "#contact-page-interest option:nth-child(7)", fi: "Muu yhteydenotto", en: "Other enquiry" },
    { selector: ".contact-page-form label[for='contact-page-message']", fi: "Viesti", en: "Message" },
    { selector: "#contact-page-message", attr: "placeholder", fi: "Kerro lyhyesti, mitä haluaisit selvittää.", en: "Briefly tell us what you would like to discuss." },
    { selector: ".contact-page-form .btn-primary", fi: "Lähetä viesti", en: "Send message" },
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
    { selector: ".legal-document > p:nth-of-type(4)", html: true, fi: "Tietosuojaan liittyvissä kysymyksissä voit ottaa yhteyttä <a href=\"../yhteys.html\">yhteydenottolomakkeella</a>.", en: "For privacy-related questions, use the <a href=\"../yhteys.html\">contact form</a>." }
  ],
  "legal-terms": [
    { selector: ".legal-document h1", fi: "Käyttöehdot", en: "Terms of use" },
    { selector: ".legal-document > p:nth-of-type(1)", fi: "SkriptLab on käsikirjoitustyön tueksi tarkoitettu palvelu. Palvelun tuottamat havainnot ja ehdotukset ovat työskentelyn apuvälineitä, eivät julkaisu-, toimitus- tai oikeudellisia päätöksiä.", en: "SkriptLab is a service for supporting manuscript work. The observations and suggestions produced by the service are working aids, not publishing, editorial or legal decisions." },
    { selector: ".legal-document h2:nth-of-type(1)", fi: "Aineiston oikeudet", en: "Rights to material" },
    { selector: ".legal-document > p:nth-of-type(2)", fi: "Käyttäjä säilyttää oikeudet palveluun tuomaansa aineistoon. SkriptLab saa käsitellä aineistoa siinä laajuudessa kuin palvelun tuottaminen edellyttää.", en: "The user retains rights to material brought into the service. SkriptLab may process the material to the extent required to provide the service." },
    { selector: ".legal-document h2:nth-of-type(2)", fi: "EU-käsittely", en: "EU processing" },
    { selector: ".legal-document > p:nth-of-type(3)", fi: "Palvelun oma backend, tietokanta, lokit ja varmuuskopiot sijaitsevat EU-alueella. Käsikirjoitusaineistoja käsitellään ja säilytetään EU-palvelimilla palvelun tuottamista varten.", en: "The service backend, database, logs and backups are located in the EU. Manuscript materials are processed and stored on EU servers to provide the service." },
    { selector: ".legal-document h2:nth-of-type(3)", fi: "Yhteydenotot", en: "Contact" },
    { selector: ".legal-document > p:nth-of-type(4)", html: true, fi: "Käyttöehtoihin liittyvissä kysymyksissä voit ottaa yhteyttä <a href=\"../yhteys.html\">yhteydenottolomakkeella</a>.", en: "For questions about the terms of use, use the <a href=\"../yhteys.html\">contact form</a>." }
  ],
  "legal-cookies": [
    { selector: ".legal-document h1", fi: "Evästeet", en: "Cookies" },
    { selector: ".legal-document > p:nth-of-type(1)", fi: "SkriptLabin verkkosivu ei tällä hetkellä käytä evästeitä, analytiikkaevästeitä, markkinointipikseleitä tai muita vastaavia seurantateknologioita.", en: "The SkriptLab website currently does not use cookies, analytics cookies, marketing pixels or similar tracking technologies." },
    { selector: ".legal-document h2:nth-of-type(1)", fi: "Välttämättömät toiminnot", en: "Essential functionality" },
    { selector: ".legal-document > p:nth-of-type(2)", fi: "Sivu on staattinen verkkosivu, joka toimii ilman evästeitä. Selaimesi voi kuitenkin käsitellä tavanomaisia teknisiä tietoja sivun lataamista varten.", en: "The site is a static website and works without cookies. Your browser may still process ordinary technical information required to load the page." },
    { selector: ".legal-document h2:nth-of-type(2)", fi: "Muutokset", en: "Changes" },
    { selector: ".legal-document > p:nth-of-type(3)", fi: "Jos sivustolle lisätään myöhemmin analytiikkaa, kirjautumistoimintoja tai muita evästeitä hyödyntäviä palveluja, päivitämme tämän sivun ennen niiden käyttöönottoa.", en: "If analytics, login functionality or other services using cookies are added later, this page will be updated before they are introduced." },
    { selector: ".legal-document > p:nth-of-type(4)", html: true, fi: "Kysymyksissä voit ottaa yhteyttä <a href=\"../yhteys.html\">yhteydenottolomakkeella</a>.", en: "For questions, use the <a href=\"../yhteys.html\">contact form</a>." }
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

function syncLanguageLinks(lang) {
  document.querySelectorAll("a[href]").forEach((link) => {
    const rawHref = link.getAttribute("href") || "";

    if (
      !rawHref ||
      rawHref.startsWith("#") ||
      rawHref.startsWith("mailto:") ||
      rawHref.startsWith("tel:") ||
      rawHref.startsWith("javascript:")
    ) {
      return;
    }

    let url;
    try {
      url = new URL(rawHref, window.location.href);
    } catch (error) {
      return;
    }

    if (url.origin !== window.location.origin || url.pathname.startsWith("/app/")) {
      return;
    }

    const isSitePage = url.pathname === "/" || url.pathname.endsWith("/") || url.pathname.endsWith(".html");
    if (!isSitePage) {
      return;
    }

    if (lang === "en") {
      url.searchParams.set("lang", "en");
    } else {
      url.searchParams.delete("lang");
    }

    link.setAttribute("href", `${url.pathname}${url.search}${url.hash}`);
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

function applyInlineTranslations(lang) {
  document.querySelectorAll("[data-fi][data-en]").forEach((element) => {
    const value = element.getAttribute(`data-${lang}`);
    if (typeof value !== "string") return;

    const attribute = element.getAttribute("data-i18n-attr");
    if (attribute) {
      element.setAttribute(attribute, value);
    } else if (element.hasAttribute("data-i18n-html")) {
      element.innerHTML = value;
    } else {
      element.textContent = value;
    }
  });
}

function applyMeta(lang) {
  const meta = metaTranslations[pageKey]?.[lang] || {};
  const inlineTitle = document.body?.getAttribute(`data-title-${lang}`);
  const inlineDescription = document.body?.getAttribute(`data-description-${lang}`);
  const title = inlineTitle || meta.title;
  const descriptionText = inlineDescription || meta.description;

  if (title) {
    document.title = title;
  }

  const description = document.querySelector("meta[name='description']");
  if (description && descriptionText) {
    description.setAttribute("content", descriptionText);
  }

  const ogTitle = document.querySelector("meta[property='og:title']");
  if (ogTitle && (meta.ogTitle || title)) {
    ogTitle.setAttribute("content", meta.ogTitle || title);
  }

  const ogDescription = document.querySelector("meta[property='og:description']");
  if (ogDescription && (meta.ogDescription || descriptionText)) {
    ogDescription.setAttribute("content", meta.ogDescription || descriptionText);
  }
}

function updateLanguageButtons(lang) {
  document.querySelectorAll("[data-language-toggle]").forEach((button) => {
    button.setAttribute("aria-label", lang === "fi" ? "Switch to English" : "Vaihda suomeksi");
    button.setAttribute("title", "FI / EN");
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
  applyInlineTranslations(lang);
  applyNavigationLabels(lang);
  syncLanguageLinks(lang);
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

  const target = currentLanguage === "en" ? "/yhteys.html?lang=en" : "/yhteys.html";
  window.location.href = target;
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMenuOpen(false);
    closeLoginModal();
  }
});

ensureLanguageToggle();
setLanguage(currentLanguage);

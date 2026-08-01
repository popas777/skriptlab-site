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
      title: "SkriptLab - kirjoita, analysoi, editoi, oikolue ja käännä",
      description: "SkriptLab on käsikirjoitusohjelmisto kirjoittamiseen, analysointiin, editointiin, oikolukuun ja käännösversioiden tekemiseen.",
      ogTitle: "SkriptLab",
      ogDescription: "Kirjoita, analysoi, editoi, oikolue ja tee käännösversioita samassa käsikirjoitustyötilassa."
    },
    en: {
      title: "SkriptLab - write, analyse, edit, proofread and translate",
      description: "SkriptLab is manuscript software for writing, analysing, editing, proofreading and creating translation versions.",
      ogTitle: "SkriptLab",
      ogDescription: "Write, analyse, edit, proofread and create translation versions in one manuscript workspace."
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
      description: "Tuo käsikirjoitus ja etene analyysin, kehityspalautteen ja teoksen tietopankin kautta editointiin, oikolukuun, kuvitukseen, taittoon, audioon ja käännöksiin."
    },
    en: {
      title: "Workflow - SkriptLab",
      description: "Import your manuscript and move through analysis, developmental feedback and the manuscript knowledge base to editing, proofreading, illustration, layout, audio and translation."
    }
  },
  pricing: {
    fi: {
      title: "Hinnoittelu - SkriptLab",
      description: "SkriptLabin kirjailijatyökalujen käyttöoikeus 99 €/kk ja 300-sivuisen teoksen käännösversioiden ohjelmistopaketti 490 €."
    },
    en: {
      title: "Pricing - SkriptLab",
      description: "SkriptLab writer tools cost €99/month, and the software package for translation versions of a 300-page work costs €490."
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
  { selector: ".footer-brand p", fi: "Käsikirjoitusohjelmisto kirjoittamiseen, analysointiin, editointiin, oikolukuun ja käännösversioihin.", en: "Manuscript software for writing, analysing, editing, proofreading and translation versions." },
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
    { selector: ".hero h1", fi: "Kirjoita, analysoi, editoi, oikolue ja käännä", en: "Write, analyse, edit, proofread and translate" },
    { selector: ".hero-sub", fi: "Koko käsikirjoitustyö yhdessä sovelluksessa.", en: "Your complete manuscript workflow in one application." },
    {
      selector: ".hero-desc",
      fi: "Aloita tyhjästä tai tuo valmis teksti. Analysoi kokonaisuus, työstä käsikirjoitusta luku kerrallaan, oikolue valitsemasi osiot ja luo vaihtoehtoisia käännösversioita valitulle kielelle. Sinä hyväksyt muutokset ja teet päätökset – SkriptLab antaa työkalut.",
      en: "Start from a blank page or import an existing text. Analyse the whole work, edit the manuscript chapter by chapter, proofread the sections you choose and create alternative translation versions for one selected target language. You approve the changes and make the decisions – SkriptLab provides the tools."
    },
    { selector: ".hero-actions .btn-primary", fi: "Pyydä käyttöoikeus", en: "Request access" },
    { selector: ".hero-actions .btn-ghost", fi: "Tutustu toimintoihin", en: "Explore the tools" },
    { selector: ".core-actions", attr: "aria-label", fi: "SkriptLabin perustoiminnot", en: "Core SkriptLab tools" },
    { selector: ".core-actions li:nth-child(1)", fi: "Kirjoita", en: "Write" },
    { selector: ".core-actions li:nth-child(2)", fi: "Analysoi", en: "Analyse" },
    { selector: ".core-actions li:nth-child(3)", fi: "Editoi", en: "Edit" },
    { selector: ".core-actions li:nth-child(4)", fi: "Oikolue", en: "Proofread" },
    { selector: ".core-actions li:nth-child(5)", fi: "Käännä", en: "Translate" },
    { selector: ".hero-trust", fi: "Tekstin oikeudet säilyvät sinulla. SkriptLab on ohjelmistoyritys — emme julkaise teoksia. Palvelun oma data käsitellään EU-alueella.", en: "You retain the rights to your text. SkriptLab is a software company — we do not publish works. The service's own data is processed in the EU." },
    { selector: ".product-shot-label", fi: "SkriptLab", en: "SkriptLab" },
    { selector: ".product-shot-bar strong", fi: "Kirjoita ja editoi", en: "Write and edit" },
    { selector: ".product-shot-open img", attr: "alt", fi: "SkriptLabin kirjoitus- ja editointinäkymä: teoksen tietopankki, käsikirjoitus ja oikolukutehtävät rinnakkain.", en: "SkriptLab writing and editing view with the manuscript knowledge base, text and proofreading tasks side by side." },
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
    { selector: ".feature-card:nth-child(6) h2", fi: "Taitto", en: "Layout" },
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
    { selector: ".section-title", fi: "Hallitse käsikirjoituksen koko työnkulku", en: "Manage your entire manuscript workflow" },
    { selector: ".section-intro", fi: "Tuo teksti ja etene analyysistä kehityseditointipalautteen kautta editointiin, oikolukuun, kuvitukseen, taittoon, audiotyöversioon ja käännökseen. Valitse vain projektillesi sopivat vaiheet — sinä hyväksyt muutokset ja päätät lopputuloksesta.", en: "Import your text and move from analysis and developmental editing feedback to editing, proofreading, illustration, layout, an audio work version and translation. Use only the stages your project needs—you approve the changes and decide the final result." },
    { selector: ".workflow-step:nth-child(1) h2", fi: "Tuo käsikirjoitus", en: "Import your manuscript" },
    { selector: ".workflow-step:nth-child(1) p", fi: "Aloita tyhjästä tai tuo valmis teksti ja pidä luvut sekä rakenne yhdessä projektissa.", en: "Start from a blank page or import an existing text, keeping its chapters and structure in one project." },
    { selector: ".workflow-step:nth-child(2) h2", fi: "Analysoi kokonaisuus", en: "Analyse the whole work" },
    { selector: ".workflow-step:nth-child(2) p", fi: "Tunnista rakenteen, tyylin, henkilöiden, rytmin ja jatkuvuuden vahvuudet sekä kehityskohdat.", en: "Identify strengths and areas to improve in structure, style, characters, pacing and continuity." },
    { selector: ".workflow-step:nth-child(3) h2", fi: "Saa kehityseditointipalaute", en: "Get developmental editing feedback" },
    { selector: ".workflow-step:nth-child(3) p", fi: "SkriptLab kokoaa analyysiin perustuvan, priorisoidun palautteen rakenteesta, kerronnasta, henkilöistä ja seuraavista muokkausaskelista.", en: "SkriptLab turns the analysis into prioritised feedback on structure, narrative, characters and the next revision steps." },
    { selector: ".workflow-step:nth-child(4) h2", fi: "Kokoa teoksen tietopankki", en: "Build the manuscript knowledge base" },
    { selector: ".workflow-step:nth-child(4) p", fi: "Tarkista analyysin kokoamat henkilöt, paikat, aikajana, termit ja pysyvät faktat. Täydennä niitä editorin tueksi.", en: "Review the characters, places, timeline, terms and established facts gathered by the analysis. Expand them to support your editing." },
    { selector: ".workflow-step:nth-child(5) h2", fi: "Jalosta ja editoi", en: "Revise and edit" },
    { selector: ".workflow-step:nth-child(5) p", fi: "Kirjoita lisää, muokkaa luku kerrallaan ja hyväksy vain haluamasi ehdotukset.", en: "Keep writing, edit one chapter at a time and accept only the suggestions you want." },
    { selector: ".workflow-step:nth-child(6) h2", fi: "Oikolue ja viimeistele", en: "Proofread and finalise" },
    { selector: ".workflow-step:nth-child(6) p", fi: "Tarkista kieli- ja kirjoitusvirheet, käy korjaukset läpi ja kokoa viimeistelty versio.", en: "Check language and spelling, review each correction and assemble a polished version." },
    { selector: ".workflow-step:nth-child(7) h2", fi: "Luo kuvitus", en: "Create illustrations" },
    { selector: ".workflow-step:nth-child(7) p", fi: "Suunnittele kansi ja luo kuvitusvaihtoehtoja käsikirjoituksen sisällön ja tyylin pohjalta.", en: "Plan the cover and create illustration options based on the manuscript's content and style." },
    { selector: ".workflow-step:nth-child(8) h2", fi: "Taita", en: "Lay out" },
    { selector: ".workflow-step:nth-child(8) p", fi: "Muotoile teos, tarkista sivut lukutilassa ja vie taittotiedostot seuraavaan tuotantovaiheeseen.", en: "Format the work, review its pages in reading view and export the layout files for the next production stage." },
    { selector: ".workflow-step:nth-child(9) .workflow-step-title", fi: "Valmistele äänikäsikirjoitus ja kuuntele", en: "Prepare the audio script and listen" },
    { selector: ".workflow-step:nth-child(9) .coming-soon", fi: "Tulossa", en: "Coming soon" },
    { selector: ".workflow-step:nth-child(9) p", fi: "Muokkaa teksti ääneen toimivaksi ja kuuntele audiotyöversio suoraan ohjelmistossa.", en: "Shape the text for spoken delivery and listen to an audio work version directly in the application." },
    { selector: ".workflow-step:nth-child(10) h2", fi: "Käännä", en: "Translate" },
    { selector: ".workflow-step:nth-child(10) p", fi: "Luo vaihtoehtoisia käännösversioita, vertaa lähdettä ja käännöstä rinnakkain ja viimeistele valittu versio.", en: "Create alternative translation versions, compare source and translation side by side, and refine the selected version." },
    { selector: ".workflow-actions .btn-primary", fi: "Pyydä käyttöoikeus", en: "Request access" },
    { selector: ".workflow-actions .btn-ghost", fi: "Tutustu ominaisuuksiin", en: "Explore features" }
  ],
  pricing: [
    { selector: ".pricing-section .section-inner > .section-label", fi: "Hinnoittelu", en: "Pricing" },
    { selector: ".section-title", fi: "Ohjelmiston hinnat käyttötavan mukaan", en: "Software pricing based on how you use SkriptLab" },
    { selector: ".section-intro", fi: "Valitse jatkuva käyttö kirjailijatyökaluihin tai teoskohtainen paketti käännösversioiden tekemiseen. Kirjoitat, analysoit, editoit ja oikoluet itse sovelluksessa.", en: "Choose ongoing access to writer tools or a per-work package for creating translation versions. You write, analyse, edit and proofread in the application yourself." },
    { selector: "#writer-tools-card .price-model", fi: "Kuukausikäyttö", en: "Monthly access" },
    { selector: "#writer-tools-card h2", fi: "Kirjailijatyökalut", en: "Writer tools" },
    { selector: "#writer-tools-card .price-amount strong", fi: "99 €", en: "€99" },
    { selector: "#writer-tools-card .price-amount span", fi: "/ kk", en: "/ month" },
    { selector: "#writer-tools-card .price-description", fi: "Käyttöoikeus SkriptLabin kirjoitus-, analyysi-, editointi- ja oikolukutyökaluihin.", en: "Access to SkriptLab's writing, analysis, editing and proofreading tools." },
    { selector: "#writer-tools-card li:nth-child(1)", fi: "Kirjoitus- ja editointityötila", en: "Writing and editing workspace" },
    { selector: "#writer-tools-card li:nth-child(2)", fi: "Käsikirjoitusanalyysi", en: "Manuscript analysis" },
    { selector: "#writer-tools-card li:nth-child(3)", fi: "Oikoluku ja versiointi", en: "Proofreading and versioning" },
    { selector: "#writer-tools-card li:nth-child(4)", fi: "Tiedostoviennit", en: "File exports" },
    { selector: "#translation-package-card .price-model", fi: "Teoskohtainen ohjelmistopaketti", en: "Per-work software package" },
    { selector: "#translation-package-card h2", fi: "Käännösversiopaketti", en: "Translation version package" },
    { selector: "#translation-package-card .price-amount strong", fi: "490 €", en: "€490" },
    { selector: "#translation-package-card .price-amount span", fi: "esimerkkihinta", en: "example price" },
    { selector: "#translation-package-card .price-description", fi: "300-sivuiselle lähdekäsikirjoitukselle ja yhdelle valitulle kohdekielelle.", en: "For a 300-page source manuscript and one selected target language." },
    { selector: "#translation-package-card li:nth-child(1)", fi: "Kolme vaihtoehtoista käännösversiota", en: "Three alternative translation versions" },
    { selector: "#translation-package-card li:nth-child(2)", fi: "Käyttäjä valitsee yhden version jatkoon", en: "You select one version to continue with" },
    { selector: "#translation-package-card li:nth-child(3)", fi: "Valitun version lähdevertailu ja oikoluku", en: "Source comparison and proofreading for the selected version" },
    { selector: "#translation-package-card li:nth-child(4)", fi: "Valitun version muokkaus ja tiedostovienti", en: "Editing and file export for the selected version" },
    { selector: ".software-pricing-note", attr: "aria-label", fi: "Hinnoittelun rajaus", en: "Pricing scope" },
    { selector: ".software-pricing-note strong", fi: "Ohjelmisto, ei käännös- tai oikolukupalvelu.", en: "Software, not a translation or proofreading service." },
    { selector: ".software-pricing-note p", fi: "Paketti koskee yhtä kohdekieltä kerrallaan. Hinta kattaa SkriptLabin käyttöoikeuden ja koko yllä kuvatun kokonaisuuden. Suosittelemme, että käyttäjä tai hänen valitsemansa kieliasiantuntija tarkistaa lopputuloksen ennen julkaisua. Kaikki aineistot ja oikeudet toimitetaan tilaajalle. SkriptLab ei käytä, myy eikä julkaise toimeksiantojen aineistoja.", en: "The package covers one target language at a time. The price includes access to SkriptLab and the complete package described above. We recommend that the user or a language specialist of their choice review the final result before publication. All materials and rights are delivered to the customer. SkriptLab does not use, sell or publish materials from assignments." },
    { selector: ".pricing-followup .btn-primary", fi: "Pyydä käyttöoikeus", en: "Request access" }
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

const productShotOpenButton = document.querySelector("[data-product-shot-open]");
const productShotDialog = document.querySelector("[data-product-shot-dialog]");
const productShotCloseButton = document.querySelector("[data-product-shot-close]");

if (productShotOpenButton && productShotDialog && productShotCloseButton) {
  productShotOpenButton.addEventListener("click", () => {
    if (typeof productShotDialog.showModal !== "function") {
      const imageUrl = productShotOpenButton.querySelector("img")?.src || "assets/skriptlab-editor.jpg";
      window.open(imageUrl, "_blank", "noopener,noreferrer");
      return;
    }

    document.body.classList.add("product-shot-modal-open");
    productShotDialog.showModal();
    productShotCloseButton.focus();
  });

  productShotCloseButton.addEventListener("click", () => {
    productShotDialog.close();
  });

  productShotDialog.addEventListener("click", (event) => {
    if (event.target === productShotDialog) {
      productShotDialog.close();
    }
  });

  productShotDialog.addEventListener("close", () => {
    document.body.classList.remove("product-shot-modal-open");
    productShotOpenButton.focus();
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

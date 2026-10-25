(function (root) {
  "use strict";

  // Original-work languages, keyed by title AND author, not by import IDs,
  // the Finnish edition's language or the author's nationality.
  const records = [
    {"title": "Tulipunainen neilikka", "author": "Emmuska Orczy", "language": "en"},
    {"title": "Wildfell Hallin vuokralainen", "author": "Anne Brontë", "language": "en"},
    {"title": "Protestanttinen etiikka ja kapitalismin henki", "author": "Max Weber", "language": "de"},
    {"title": "Spoon Riverin antologia", "author": "Edgar Lee Masters", "language": "en"},
    {"title": "Quo vadis", "author": "Henryk Sienkiewicz", "language": "pl"},
    {"title": "Rautatielapset", "author": "E. Nesbit", "language": "en"},
    {"title": "Merisusi", "author": "Jack London", "language": "en"},
    {"title": "Ruuvikierre", "author": "Henry James", "language": "en"},
    {"title": "Viimeinen mohikaani", "author": "James Fenimore Cooper", "language": "en"},
    {"title": "Walden – elämää metsässä", "author": "Henry David Thoreau", "language": "en"},
    {"title": "Sherlock Holmesin paluu", "author": "Arthur Conan Doyle", "language": "en"},
    {"title": "Jumalainen näytelmä", "author": "Dante Alighieri", "language": "it"},
    {"title": "Faust", "author": "Johann Wolfgang von Goethe", "language": "de"},
    {"title": "David Copperfield", "author": "Charles Dickens", "language": "en"},
    {"title": "Vanja-eno", "author": "Anton Tšehov", "language": "ru"},
    {"title": "Notre Damen kellonsoittaja", "author": "Victor Hugo", "language": "fr"},
    {"title": "Suuret odotukset", "author": "Charles Dickens", "language": "en"},
    {"title": "Kuolleet sielut", "author": "Nikolai Gogol", "language": "ru"},
    {"title": "Candide eli optimismi", "author": "Voltaire", "language": "fr"},
    {"title": "Oblomov", "author": "Ivan Gontšarov", "language": "ru"},
    {"title": "Idiootti", "author": "Fjodor Dostojevski", "language": "ru"},
    {"title": "Jane Eyre", "author": "Charlotte Brontë", "language": "en"},
    {"title": "Taikavuori", "author": "Thomas Mann", "language": "de"},
    {"title": "Don Quijote", "author": "Miguel de Cervantes Saavedra", "language": "es"},
    {"title": "Tuulen viemää", "author": "Margaret Mitchell", "language": "en"},
    {"title": "Aikakone", "author": "H. G. Wells", "language": "en"},
    {"title": "Delfiinin ilta lahdella", "author": "J. Murto", "language": "fi"},
    {"title": "Isä", "author": "August Strindberg", "language": "sv"},
    {"title": "Utopia", "author": "Thomas More", "language": "la"},
    {"title": "Saituri", "author": "Molière", "language": "fr"},
    {"title": "Shakkitarina", "author": "Stefan Zweig", "language": "de"},
    {"title": "Muodonmuutos", "author": "Franz Kafka", "language": "de"},
    {"title": "Valtio", "author": "Platon", "language": "grc"},
    {"title": "Kansojen varallisuus", "author": "Adam Smith", "language": "en"},
    {"title": "Oopperan kummitus", "author": "Gaston Leroux", "language": "fr"},
    {"title": "Isät ja pojat", "author": "Ivan Turgenev", "language": "ru"},
    {"title": "Profeetta", "author": "Kahlil Gibran", "language": "en"},
    {"title": "Pimeyden sydän", "author": "Joseph Conrad", "language": "en"},
    {"title": "Prinssi ja kerjäläinen", "author": "Mark Twain", "language": "en"},
    {"title": "Annan unelmavuodet", "author": "L. M. Montgomery", "language": "en"},
    {"title": "Ruhtinas", "author": "Niccolò Machiavelli", "language": "it"},
    {"title": "Sota ja rauha", "author": "Leo Tolstoi", "language": "ru"},
    {"title": "Karamazovin veljekset", "author": "Fjodor Dostojevski", "language": "ru"},
    {"title": "Kurjat", "author": "Victor Hugo", "language": "fr"},
    {"title": "Pähkinänsärkijä ja Hiirikuningas", "author": "E. T. A. Hoffmann", "language": "de"},
    {"title": "Heidi", "author": "Johanna Spyri", "language": "de"},
    {"title": "Robinson Crusoe", "author": "Daniel Defoe", "language": "en"},
    {"title": "Me", "author": "Jevgeni Zamjatin", "language": "ru"},
    {"title": "Cthulhun kutsu", "author": "H. P. Lovecraft", "language": "en"},
    {"title": "Oliver Twist", "author": "Charles Dickens", "language": "en"},
    {"title": "Ozin velho", "author": "L. Frank Baum", "language": "en"},
    {"title": "Pollyanna", "author": "Eleanor H. Porter", "language": "en"},
    {"title": "Peter Pan", "author": "J. M. Barrie", "language": "en"},
    {"title": "Tulipunainen tutkimus", "author": "Arthur Conan Doyle", "language": "en"},
    {"title": "Minun Ántoniani", "author": "Willa Cather", "language": "en"},
    {"title": "Kelpo sotilas", "author": "Ford Madox Ford", "language": "en"},
    {"title": "Vailla nimeä", "author": "Wilkie Collins", "language": "en"},
    {"title": "Mansfield Park", "author": "Jane Austen", "language": "en"},
    {"title": "Gulliverin matkat", "author": "Jonathan Swift", "language": "en"},
    {"title": "Siepattu", "author": "Robert Louis Stevenson", "language": "en"},
    {"title": "Peukaloisen retket", "author": "Selma Lagerlöf", "language": "sv"},
    {"title": "Samettipupu", "author": "Margery Williams Bianco", "language": "en"},
    {"title": "Jaakko ja pavunvarsi", "author": "Joseph Jacobs (toim.)", "language": "en"},
    {"title": "Kolme pientä porsasta", "author": "Joseph Jacobs (toim.)", "language": "en"},
    {"title": "Pikkuprinssi", "author": "Antoine de Saint-Exupéry", "language": "fr"},
    {"title": "Joulupukin elämä ja seikkailut", "author": "L. Frank Baum", "language": "en"},
    {"title": "Punahilkka", "author": "Jacob ja Wilhelm Grimm", "language": "de"},
    {"title": "Tähkäpää", "author": "Jacob ja Wilhelm Grimm", "language": "de"},
    {"title": "Prinsessa Ruusunen", "author": "Jacob ja Wilhelm Grimm", "language": "de"},
    {"title": "Bremenin soittoniekat", "author": "Jacob ja Wilhelm Grimm", "language": "de"},
    {"title": "Sammakkoprinssi", "author": "Jacob ja Wilhelm Grimm", "language": "de"},
    {"title": "Prinsessa ja herne", "author": "H. C. Andersen", "language": "da"},
    {"title": "Keisarin uudet vaatteet", "author": "H. C. Andersen", "language": "da"},
    {"title": "Vakaa tinasotamies", "author": "H. C. Andersen", "language": "da"},
    {"title": "Pieni tulitikkutyttö", "author": "H. C. Andersen", "language": "da"},
    {"title": "Tohtori Jekyllin ja herra Hyden merkillinen tapaus", "author": "Robert Louis Stevenson", "language": "en"},
    {"title": "Viidakkokirja", "author": "Rudyard Kipling", "language": "en"},
    {"title": "Huckleberry Finnin seikkailut", "author": "Mark Twain", "language": "en"},
    {"title": "Tom Sawyerin seikkailut", "author": "Mark Twain", "language": "en"},
    {"title": "Uljas Musta", "author": "Anna Sewell", "language": "en"},
    {"title": "Kadonnut maailma", "author": "Arthur Conan Doyle", "language": "en"},
    {"title": "Ivanhoe", "author": "Walter Scott", "language": "en"},
    {"title": "Kolme muskettisoturia", "author": "Alexandre Dumas; Auguste Maquet", "language": "fr"},
    {"title": "Anna Karenina", "author": "Leo Tolstoi", "language": "ru"},
    {"title": "Nummisuutarit", "author": "Aleksis Kivi", "language": "fi"},
    {"title": "Juha", "author": "Juhani Aho", "language": "fi"},
    {"title": "Paljain jaloin", "author": "Uuno Kailas", "language": "fi"},
    {"title": "Pimeänpirtin hävitys", "author": "Maila Talvio", "language": "fi"},
    {"title": "Lapsia", "author": "Teuvo Pakkala", "language": "fi"},
    {"title": "Puukkojunkkarit", "author": "Santeri Alkio", "language": "fi"},
    {"title": "Kun on tunteet", "author": "Maria Jotuni", "language": "fi"},
    {"title": "Kiljusen herrasväki", "author": "Jalmari Finne", "language": "fi"},
    {"title": "Laulu tulipunaisesta kukasta", "author": "Johannes Linnankoski", "language": "fi"},
    {"title": "Tulitikkuja lainaamassa", "author": "Maiju Lassila", "language": "fi"},
    {"title": "Sata ja yksi laulua; Hiihtäjän virsiä; Pyhä kevät", "author": "Eino Leino", "language": "fi"},
    {"title": "Vänrikki Stoolin tarinat", "author": "J. L. Runeberg", "language": "sv"},
    {"title": "Kalevala", "author": "Elias Lönnrot", "language": "fi"},
    {"title": "Huligaani ynnä muita kertoelmia", "author": "Arvid Järnefelt", "language": "fi"},
    {"title": "Työmiehen vaimo", "author": "Minna Canth", "language": "fi"},
    {"title": "Yksin", "author": "Juhani Aho", "language": "fi"},
    {"title": "Anna Liisa; Kotoa pois", "author": "Minna Canth", "language": "fi"},
    {"title": "Lastuja I–III", "author": "Juhani Aho", "language": "fi"},
    {"title": "Suomen kansan satuja ja tarinoita", "author": "Eero Salmelainen", "language": "fi"},
    {"title": "Karavaani ja muita juttuja", "author": "Pentti Haanpää", "language": "fi"},
    {"title": "Seitsemän veljestä", "author": "Aleksis Kivi", "language": "fi"},
    {"title": "Agnes", "author": "Minna Canth", "language": "fi"},
    {"title": "Putkinotko", "author": "Joel Lehtonen", "language": "fi"},
    {"title": "Rautatie", "author": "Juhani Aho", "language": "fi"},
    {"title": "Lintukoto: Muutamia päiväkirjan lehtiä", "author": "Joel Lehtonen", "language": "fi"},
    {"title": "Kultahattu", "author": "F. Scott Fitzgerald", "language": "en"},
    {"title": "Rikos ja rangaistus", "author": "Fjodor Dostojevski", "language": "ru"},
    {"title": "Humiseva harju", "author": "Emily Brontë", "language": "en"},
    {"title": "Pikku naisia", "author": "Louisa May Alcott", "language": "en"},
    {"title": "Liisa Ihmemaassa", "author": "Lewis Carroll", "language": "en"},
    {"title": "Dorian Grayn muotokuva", "author": "Oscar Wilde", "language": "en"},
    {"title": "Dracula", "author": "Bram Stoker", "language": "en"},
    {"title": "Frankenstein eli uusi Prometheus", "author": "Mary Shelley", "language": "en"},
    {"title": "Matka maan keskipisteeseen", "author": "Jules Verne", "language": "fr"},
    {"title": "Maailman ympäri kahdeksassakymmenessä päivässä", "author": "Jules Verne", "language": "fr"},
    {"title": "Erämaan kutsu", "author": "Jack London", "language": "en"},
    {"title": "Valkohammas", "author": "Jack London", "language": "en"},
    {"title": "Hamlet", "author": "William Shakespeare", "language": "en"},
    {"title": "Romeo ja Julia", "author": "William Shakespeare", "language": "en"},
    {"title": "1984", "author": "George Orwell", "language": "en"},
    {"title": "Maailmojen sota", "author": "H. G. Wells", "language": "en"},
    {"title": "Baskervillen koira", "author": "Arthur Conan Doyle", "language": "en"},
    {"title": "Sherlock Holmesin seikkailut", "author": "Arthur Conan Doyle", "language": "en"},
    {"title": "Ylpeys ja ennakkoluulo", "author": "Jane Austen", "language": "en"},
    {"title": "Saiturin joulu", "author": "Charles Dickens", "language": "en"},
    {"title": "Salamanterisota", "author": "Karel Čapek", "language": "cs"},
    {"title": "R.U.R.", "author": "Karel Čapek", "language": "cs"},
    {"title": "Järki ja tunteet", "author": "Jane Austen", "language": "en"},
    {"title": "Aarresaari", "author": "Robert Louis Stevenson", "language": "en"},
    {"title": "Moby Dick eli valas", "author": "Herman Melville", "language": "en"},
    {"title": "Kaislikossa suhisee", "author": "Kenneth Grahame", "language": "en"},
    {"title": "Pinokkion seikkailut", "author": "Carlo Collodi", "language": "it"},
    {"title": "Eläinten vallankumous", "author": "George Orwell", "language": "en"},
    {"title": "Nukkekoti", "author": "Henrik Ibsen", "language": "no"},
    {"title": "Viimeiset ja ensimmäiset", "author": "Olaf Stapledon", "language": "en"},
    {"title": "Tunnekasvatus (Sydämen oppivuodet)", "author": "Gustave Flaubert", "language": "fr"},
    {"title": "Leviathan", "author": "Thomas Hobbes", "language": "en"},
    {"title": "Majakka", "author": "Virginia Woolf", "language": "en"},
    {"title": "Wakefieldin kirkkoherra", "author": "Oliver Goldsmith", "language": "en"},
    {"title": "Erityisestä ja yleisestä suhteellisuusteoriasta yleistajuisesti", "author": "Albert Einstein", "language": "de"}
  ];
  const labels = { cs: "Tšekki", da: "Tanska", de: "Saksa", en: "Englanti", es: "Espanja", fi: "Suomi", fr: "Ranska", grc: "Muinaiskreikka", it: "Italia", la: "Latina", no: "Norja", pl: "Puola", ru: "Venäjä", sv: "Ruotsi" };
  const aliases = { ces: "cs", cze: "cs", dan: "da", deu: "de", ger: "de", eng: "en", spa: "es", fin: "fi", fra: "fr", fre: "fr", ita: "it", lat: "la", nb: "no", nn: "no", nob: "no", nno: "no", nor: "no", pol: "pl", rus: "ru", swe: "sv" };
  const fold = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const titleKey = value => fold(String(value || "").replace(/\s*\((?:versio\s+)?v\d+(?:\.\d+)*\)\s*$/iu, "").replace(/\s*[–—-]\s*äänikirja\s*$/iu, ""));
  const identity = work => `${titleKey(work.title || work.name || work.work_title)}|${fold(work.author || work.creator || work.author_name)}`;
  const byIdentity = new Map(records.map(record => [identity(record), record.language]));
  const displayNames = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["fi"], { type: "language" }) : null;
  function normalize(value) {
    const primary = String(value || "").trim().toLowerCase().split(/[-_]/)[0];
    return /^[a-z]{2,3}$/.test(primary) && !["und", "mul", "zxx"].includes(primary) ? aliases[primary] || primary : "";
  }
  function label(code) {
    const language = normalize(code);
    if (!language) return "Ei tiedossa";
    return labels[language] || displayNames?.of(language) || language;
  }
  function forWork(work) {
    if (!work) return [];
    const source = work.raw || work;
    const explicit = source.original_languages ?? source.original_language ?? source.original_language_code;
    if (explicit !== undefined && explicit !== null && explicit !== "") {
      return [...new Set((Array.isArray(explicit) ? explicit : [explicit]).map(normalize).filter(Boolean))];
    }
    const language = byIdentity.get(identity({ ...source, title: work.title || source.title, author: work.author || source.author }));
    return language ? [language] : [];
  }
  function options(works = []) {
    const codes = new Set([...records.map(record => record.language), ...works.flatMap(forWork)]);
    return [...codes].map(value => ({ value, label: label(value) })).sort((a, b) => a.label.localeCompare(b.label, "fi"));
  }
  function selectWorks(works, language) {
    if (!language) return works;
    return works.filter(work => language === "unknown" ? forWork(work).length === 0 : forWork(work).includes(language));
  }
  const api = { records, normalize, label, forWork, options, selectWorks };
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SkriptLabLibraryOriginalLanguage = api;
})(typeof window === "undefined" ? {} : window);

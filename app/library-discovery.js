(function (root) {
  "use strict";

  // Curated discovery metadata. Edit the ordered entries to update the lists;
  // membership uses both title and author, so imports may receive new IDs.
  const groups = [
    { id: "fairy-fantasy", label: "Sadut ja fantasia", labels: ["Sadut", "Kansansadut", "Kansanperinne", "Fantasia", "Filosofinen satu", "Joulu"], codes: ["FM", "FQ", "YFH", "YFJ"] },
    { id: "adventure", label: "Seikkailu", labels: ["Seikkailu", "Meriseikkailu"], codes: ["FJ", "YFC"] },
    { id: "crime-horror", label: "Rikos, jännitys ja kauhu", labels: ["Mysteeri ja rikos", "Rikos", "Jännitys", "Kauhu"], codes: ["FF", "FH", "FK", "YFD", "YFCF"] },
    { id: "scifi", label: "Scifi ja dystopia", labels: ["Tieteiskirjallisuus", "Scifi", "Dystopia"], codes: ["FL", "FHP", "YFG"] },
    { id: "people", label: "Ihmissuhteet ja kasvu", labels: ["Rakkaus ja ihmissuhteet", "Perhe ja suku", "Ystävyys", "Kasvu ja nuoruus", "Lapsuus", "Kauneus ja moraali"], codes: ["FR", "FS", "FXB", "FXC", "FXD", "YFM", "YFN"] },
    { id: "society-history", label: "Yhteiskunta ja historia", labels: ["Yhteiskunta ja valta", "Historia", "Historiallinen romaani", "Sota"], codes: ["FV", "FXP", "J", "N", "YFT"] },
    { id: "nature", label: "Luonto ja eläimet", labels: ["Luonto ja ympäristö", "Luonto", "Eläimet", "Maaseutu"], codes: ["WNC", "WNW", "PS", "RN", "YFP", "YNN"] },
    { id: "humour", label: "Huumori ja satiiri", labels: ["Huumori", "Satiiri"], codes: ["FU", "WH", "YFQ"] },
    { id: "poetry-drama", label: "Runous ja näytelmät", labels: ["Runous", "Näytelmä", "Näytelmät", "Eepos"], codes: ["DC", "DD", "YDP", "YDR"] },
    { id: "knowledge", label: "Tieto ja filosofia", labels: ["Tietokirjallisuus", "Filosofia", "Elämäkerta", "Muistelmat", "Päiväkirja", "Filosofinen satu"], codes: ["Q", "DN", "DNB", "J", "K", "N", "P", "R", "T", "V"] },
  ];
  const entry = (title, author, aliases = []) => ({ title, author, aliases });
  const sources = {
    pbs: { label: "PBS: The Great American Read", url: "https://www.pbs.org/the-great-american-read/results/" },
    children: { label: "School Library Journal: Top 100 Children's Novels", url: "https://afuse8production.slj.com/2010/04/13/the-top-100-childrens-novels-poll-1-100/" },
    canon: { label: "St. John's College: Great Books", url: "https://www.sjc.edu/academic-programs/undergraduate/great-books-reading-list" },
    finnish: { label: "Helsingin yliopisto: klassikkokirjallisuuden opinto-opas", url: "https://www.avoin.helsinki.fi/opintotarjonta/avopas.pdf" },
  };
  const lists = [
    { id: "children", label: "TOP 20 lapset", description: "Lasten ja nuorten klassikoita. Mukana on myös nuorille sopivia seikkailuja.", sources: [sources.children, sources.pbs], entries: [
      entry("Pikkuprinssi", "Antoine de Saint-Exupéry"),
      entry("Liisa Ihmemaassa", "Lewis Carroll"),
      entry("Peter Pan", "J. M. Barrie"),
      entry("Pinokkion seikkailut", "Carlo Collodi"),
      entry("Heidi", "Johanna Spyri"),
      entry("Ozin velho", "L. Frank Baum"),
      entry("Kaislikossa suhisee", "Kenneth Grahame"),
      entry("Viidakkokirja", "Rudyard Kipling"),
      entry("Peukaloisen retket", "Selma Lagerlöf"),
      entry("Pollyanna", "Eleanor H. Porter"),
      entry("Pikku naisia", "Louisa May Alcott"),
      entry("Aarresaari", "Robert Louis Stevenson"),
      entry("Tom Sawyerin seikkailut", "Mark Twain"),
      entry("Huckleberry Finnin seikkailut", "Mark Twain"),
      entry("Uljas Musta", "Anna Sewell"),
      entry("Annan unelmavuodet", "L. M. Montgomery"),
      entry("Pähkinänsärkijä ja Hiirikuningas", "E. T. A. Hoffmann"),
      entry("Samettipupu", "Margery Williams Bianco"),
      entry("Kiljusen herrasväki", "Jalmari Finne"),
      entry("Robinson Crusoe", "Daniel Defoe"),
    ] },
    { id: "knowledge", label: "TOP 20 tieto", description: "Filosofian, yhteiskunnan ja tieteen perusteoksia. Kirjastoon vielä puuttuvat teokset näkyvät valikoiman muissa teoksissa.", sources: [sources.canon], entries: [
      entry("Valtio", "Platon"), entry("Utopia", "Thomas More"),
      entry("Itselleni", "Marcus Aurelius"), entry("Ruhtinas", "Niccolò Machiavelli"),
      entry("Nikomakhoksen etiikka", "Aristoteles"), entry("Politiikka", "Aristoteles"),
      entry("Vapaudesta", "John Stuart Mill"), entry("Yhteiskuntasopimuksesta", "Jean-Jacques Rousseau"),
      entry("Leviathan", "Thomas Hobbes"), entry("Tutkielma hallitusvallasta", "John Locke"),
      entry("Metodin esitys", "René Descartes"), entry("Filosofian lohdutus", "Boethius"),
      entry("Tunnustukset", "Augustinus"), entry("Walden – elämää metsässä", "Henry David Thoreau"),
      entry("Tyhmyyden ylistys", "Erasmus Rotterdamilainen"), entry("Lajien synty", "Charles Darwin"),
      entry("Kansojen varallisuus", "Adam Smith"), entry("Sodankäynnin taito", "Sunzi", [{title:"Sodankäynnin taito",author:"Sun Tzu"}]),
      entry("Esseitä", "Michel de Montaigne"), entry("Historiat", "Herodotos", [{title:"Historiateos",author:"Herodotos"}]),
    ] },
    { id: "fiction", label: "TOP 20 kauno", description: "Maailmankirjallisuuden klassikoita kirjaston nykyisestä valikoimasta.", sources: [sources.pbs, sources.canon], entries: [
      entry("Ylpeys ja ennakkoluulo", "Jane Austen"), entry("Rikos ja rangaistus", "Fjodor Dostojevski"),
      entry("1984", "George Orwell"), entry("Anna Karenina", "Leo Tolstoi"),
      entry("Sota ja rauha", "Leo Tolstoi"), entry("Karamazovin veljekset", "Fjodor Dostojevski"),
      entry("Kurjat", "Victor Hugo"), entry("Humiseva harju", "Emily Brontë"),
      entry("Kultahattu", "F. Scott Fitzgerald"), entry("Moby Dick eli valas", "Herman Melville"),
      entry("Frankenstein eli uusi Prometheus", "Mary Shelley"), entry("Dracula", "Bram Stoker"),
      entry("Eläinten vallankumous", "George Orwell"), entry("Dorian Grayn muotokuva", "Oscar Wilde"),
      entry("Muodonmuutos", "Franz Kafka"), entry("Hamlet", "William Shakespeare"),
      entry("Gulliverin matkat", "Jonathan Swift"), entry("Pimeyden sydän", "Joseph Conrad"),
      entry("Pikku naisia", "Louisa May Alcott"), entry("Huckleberry Finnin seikkailut", "Mark Twain"),
    ] },
    { id: "finland", label: "TOP 20 Suomi", description: "Suomalaisten kirjailijoiden klassikoita ja kansallista kirjallisuusperinnettä.", sources: [sources.finnish], entries: [
      entry("Seitsemän veljestä", "Aleksis Kivi"), entry("Kalevala", "Elias Lönnrot"),
      entry("Putkinotko", "Joel Lehtonen"), entry("Rautatie", "Juhani Aho"),
      entry("Työmiehen vaimo", "Minna Canth"), entry("Anna Liisa; Kotoa pois", "Minna Canth"),
      entry("Tulitikkuja lainaamassa", "Maiju Lassila"), entry("Laulu tulipunaisesta kukasta", "Johannes Linnankoski"),
      entry("Juha", "Juhani Aho"), entry("Yksin", "Juhani Aho"),
      entry("Nummisuutarit", "Aleksis Kivi"), entry("Vänrikki Stoolin tarinat", "J. L. Runeberg"),
      entry("Sata ja yksi laulua; Hiihtäjän virsiä; Pyhä kevät", "Eino Leino"),
      entry("Kun on tunteet", "Maria Jotuni"), entry("Puukkojunkkarit", "Santeri Alkio"),
      entry("Lapsia", "Teuvo Pakkala"), entry("Agnes", "Minna Canth"),
      entry("Karavaani ja muita juttuja", "Pentti Haanpää"), entry("Paljain jaloin", "Uuno Kailas"),
      entry("Kiljusen herrasväki", "Jalmari Finne"),
    ] },
  ];
  const fold = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const titleKey = value => fold(String(value || "").replace(/\s*\((?:versio\s+)?v\d+(?:\.\d+)*\)\s*$/iu, "").replace(/\s*[–—-]\s*äänikirja\s*$/iu, ""));
  const matchesEntry = (work, item) => [item, ...(item.aliases || [])].some(identity => titleKey(work.title) === titleKey(identity.title) && fold(work.author) === fold(identity.author));
  const extraGroups = [
    [entry("Pikkuprinssi", "Antoine de Saint-Exupéry"), ["fairy-fantasy", "people", "knowledge"]],
    [entry("Frankenstein eli uusi Prometheus", "Mary Shelley"), ["crime-horror", "scifi"]],
    [entry("Dracula", "Bram Stoker"), ["crime-horror"]],
    [entry("1984", "George Orwell"), ["scifi", "society-history"]],
    [entry("Eläinten vallankumous", "George Orwell"), ["society-history", "humour"]],
    [entry("Ruhtinas", "Niccolò Machiavelli"), ["knowledge", "society-history"]],
    [entry("Profeetta", "Kahlil Gibran"), ["knowledge", "poetry-drama", "people"]],
    [entry("Kalevala", "Elias Lönnrot"), ["fairy-fantasy", "poetry-drama"]],
    [entry("Maailman ympäri kahdeksassakymmenessä päivässä", "Jules Verne"), ["adventure"]],
    [entry("Matka maan keskipisteeseen", "Jules Verne"), ["adventure", "scifi"]],
    [entry("Aikakone", "H. G. Wells"), ["scifi"]],
    [entry("Maailmojen sota", "H. G. Wells"), ["scifi"]],
    [entry("Baskervillen koira", "Arthur Conan Doyle"), ["crime-horror"]],
    [entry("Sherlock Holmesin seikkailut", "Arthur Conan Doyle"), ["crime-horror"]],
  ];
  const groupFor = value => groups.find(group => value === `group:${group.id}`);
  const listFor = value => lists.find(list => value === `top:${list.id}`);
  function groupKeys(work) {
    const result = new Set();
    for (const group of groups) {
      if ((work.themes || []).some(theme => group.labels.some(label => fold(label) === fold(theme.label)) || (theme.code && group.codes.some(code => theme.code.toUpperCase().startsWith(code))))) result.add(group.id);
    }
    for (const [identity, keys] of extraGroups) if (matchesEntry(work, identity)) keys.forEach(key => result.add(key));
    return [...result];
  }
  function selectWorks(works, value, ranked = true) {
    const group = groupFor(value), list = listFor(value);
    if (group) return works.filter(work => groupKeys(work).includes(group.id));
    if (list) {
      const selected = works.filter(work => list.entries.some(item => matchesEntry(work, item)));
      return ranked ? selected.sort((a, b) => list.entries.findIndex(item => matchesEntry(a, item)) - list.entries.findIndex(item => matchesEntry(b, item))) : selected;
    }
    return works;
  }
  function missingEntries(works, value) {
    const list = listFor(value);
    return list ? list.entries.filter(item => !works.some(work => matchesEntry(work, item))) : [];
  }
  const searchFilter = query => lists.find(list => fold(query) === fold(list.label) || (list.id === "fiction" && fold(query) === "top20kaunokirjallisuus"))?.id;
  const api = { groups, lists, groupFor, listFor, groupKeys, matchesEntry, selectWorks, missingEntries, searchFilter, isDiscoveryFilter: value => Boolean(groupFor(value) || listFor(value)) };
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SkriptLabLibraryDiscovery = api;
})(typeof window === "undefined" ? {} : window);

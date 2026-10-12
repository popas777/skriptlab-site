(function (root) {
  "use strict";

  // Original works, not import IDs or the dates of Finnish/audio editions.
  // Multi-part works use the first part's year and retain the full year range.
  const records = [
    {"title": "Tulipunainen neilikka", "author": "Emmuska Orczy", "year": 1905, "sources": ["https://en.wikipedia.org/wiki/The_Scarlet_Pimpernel"]},
    {"title": "Wildfell Hallin vuokralainen", "author": "Anne Brontë", "year": 1848, "sources": ["https://en.wikipedia.org/wiki/The_Tenant_of_Wildfell_Hall"]},
    {"title": "Protestanttinen etiikka ja kapitalismin henki", "author": "Max Weber", "year": 1904, "sources": ["https://en.wikipedia.org/wiki/The_Protestant_Ethic_and_the_Spirit_of_Capitalism"], "yearEnd": 1905, "note": "Essee ilmestyi kahdessa osassa vuosina 1904 ja 1905."},
    {"title": "Spoon Riverin antologia", "author": "Edgar Lee Masters", "year": 1915, "sources": ["https://en.wikipedia.org/wiki/Spoon_River_Anthology"]},
    {"title": "Quo vadis", "author": "Henryk Sienkiewicz", "year": 1896, "sources": ["https://en.wikipedia.org/wiki/Quo_Vadis_%28novel%29"]},
    {"title": "Rautatielapset", "author": "E. Nesbit", "year": 1906, "sources": ["https://en.wikipedia.org/wiki/The_Railway_Children"]},
    {"title": "Merisusi", "author": "Jack London", "year": 1904, "sources": ["https://en.wikipedia.org/wiki/The_Sea-Wolf"]},
    {"title": "Ruuvikierre", "author": "Henry James", "year": 1898, "sources": ["https://en.wikipedia.org/wiki/The_Turn_of_the_Screw"]},
    {"title": "Viimeinen mohikaani", "author": "James Fenimore Cooper", "year": 1826, "sources": ["https://en.wikipedia.org/wiki/The_Last_of_the_Mohicans"]},
    {"title": "Walden – elämää metsässä", "author": "Henry David Thoreau", "year": 1854, "sources": ["https://en.wikipedia.org/wiki/Walden"]},
    {"title": "Sherlock Holmesin paluu", "author": "Arthur Conan Doyle", "year": 1905, "sources": ["https://en.wikipedia.org/wiki/The_Return_of_Sherlock_Holmes"]},
    {"title": "Jumalainen näytelmä", "author": "Dante Alighieri", "century": 14, "sources": ["https://en.wikipedia.org/wiki/Divine_Comedy", "https://www.loc.gov/resource/gdcwdl.wdl_10650/?sp=7"], "note": "Keskiaikainen käsikirjoituksina levinnyt teos ajoitetaan 1300-luvulle."},
    {"title": "Faust", "author": "Johann Wolfgang von Goethe", "year": 1808, "sources": ["https://en.wikipedia.org/wiki/Goethe%27s_Faust"], "yearEnd": 1832, "note": "Ensimmäinen osa ilmestyi vuonna 1808, toinen vuonna 1832. Aiempi Faust-katkelma ilmestyi vuonna 1790."},
    {"title": "David Copperfield", "author": "Charles Dickens", "year": 1850, "sources": ["https://en.wikipedia.org/wiki/David_Copperfield"]},
    {"title": "Vanja-eno", "author": "Anton Tšehov", "year": 1897, "sources": ["https://en.wikipedia.org/wiki/Uncle_Vanya"]},
    {"title": "Notre Damen kellonsoittaja", "author": "Victor Hugo", "year": 1831, "sources": ["https://en.wikipedia.org/wiki/The_Hunchback_of_Notre-Dame"]},
    {"title": "Suuret odotukset", "author": "Charles Dickens", "year": 1861, "sources": ["https://en.wikipedia.org/wiki/Great_Expectations"]},
    {"title": "Kuolleet sielut", "author": "Nikolai Gogol", "year": 1842, "sources": ["https://en.wikipedia.org/wiki/Dead_Souls"]},
    {"title": "Candide eli optimismi", "author": "Voltaire", "year": 1759, "sources": ["https://en.wikipedia.org/wiki/Candide"]},
    {"title": "Oblomov", "author": "Ivan Gontšarov", "year": 1859, "sources": ["https://en.wikipedia.org/wiki/Oblomov"]},
    {"title": "Idiootti", "author": "Fjodor Dostojevski", "year": 1869, "sources": ["https://en.wikipedia.org/wiki/The_Idiot"]},
    {"title": "Jane Eyre", "author": "Charlotte Brontë", "year": 1847, "sources": ["https://en.wikipedia.org/wiki/Jane_Eyre"]},
    {"title": "Taikavuori", "author": "Thomas Mann", "year": 1924, "sources": ["https://en.wikipedia.org/wiki/The_Magic_Mountain"]},
    {"title": "Don Quijote", "author": "Miguel de Cervantes Saavedra", "year": 1605, "sources": ["https://en.wikipedia.org/wiki/Don_Quixote"], "yearEnd": 1615, "note": "Ensimmäinen osa ilmestyi vuonna 1605, toinen vuonna 1615."},
    {"title": "Tuulen viemää", "author": "Margaret Mitchell", "year": 1936, "sources": ["https://en.wikipedia.org/wiki/Gone_with_the_Wind_%28novel%29"]},
    {"title": "Aikakone", "author": "H. G. Wells", "year": 1895, "sources": ["https://en.wikipedia.org/wiki/The_Time_Machine"]},
    {"title": "Delfiinin ilta lahdella", "author": "J. Murto", "sources": [], "century": 21},
    {"title": "Isä", "author": "August Strindberg", "year": 1887, "sources": ["https://en.wikipedia.org/wiki/The_Father_%28Strindberg_play%29"]},
    {"title": "Utopia", "author": "Thomas More", "year": 1516, "sources": ["https://en.wikipedia.org/wiki/Utopia_%28book%29"]},
    {"title": "Saituri", "author": "Molière", "year": 1669, "sources": ["https://www.christies.com/en/lot/lot-4297002", "https://gallica.bnf.fr/selections/fr/html/litteratures/moliere-lavare"], "note": "Ensimmäinen painettu laitos ilmestyi vuonna 1669. Näytelmän ensiesitys oli vuonna 1668."},
    {"title": "Shakkitarina", "author": "Stefan Zweig", "year": 1942, "sources": ["https://en.wikipedia.org/wiki/The_Royal_Game"]},
    {"title": "Muodonmuutos", "author": "Franz Kafka", "year": 1915, "sources": ["https://en.wikipedia.org/wiki/The_Metamorphosis"]},
    {"title": "Valtio", "author": "Platon", "century": 4, "era": "bce", "sources": ["https://en.wikipedia.org/wiki/Republic_(Plato)", "https://plato.stanford.edu/entries/plato/"], "note": "Antiikin teoksen ajoitus on arvio."},
    {"title": "Kansojen varallisuus", "author": "Adam Smith", "year": 1776, "sources": ["https://en.wikipedia.org/wiki/The_Wealth_of_Nations"]},
    {"title": "Oopperan kummitus", "author": "Gaston Leroux", "year": 1910, "sources": ["https://en.wikipedia.org/wiki/The_Phantom_of_the_Opera_%28novel%29"]},
    {"title": "Isät ja pojat", "author": "Ivan Turgenev", "year": 1862, "sources": ["https://en.wikipedia.org/wiki/Fathers_and_Sons_%28novel%29"]},
    {"title": "Profeetta", "author": "Kahlil Gibran", "year": 1923, "sources": ["https://en.wikipedia.org/wiki/The_Prophet_%28book%29"]},
    {"title": "Pimeyden sydän", "author": "Joseph Conrad", "year": 1899, "sources": ["https://en.wikipedia.org/wiki/Heart_of_Darkness"]},
    {"title": "Prinssi ja kerjäläinen", "author": "Mark Twain", "year": 1881, "sources": ["https://en.wikipedia.org/wiki/The_Prince_and_the_Pauper"]},
    {"title": "Annan unelmavuodet", "author": "L. M. Montgomery", "year": 1915, "sources": ["https://en.wikipedia.org/wiki/Anne_of_the_Island"]},
    {"title": "Ruhtinas", "author": "Niccolò Machiavelli", "year": 1532, "sources": ["https://en.wikipedia.org/wiki/The_Prince"]},
    {"title": "Sota ja rauha", "author": "Leo Tolstoi", "year": 1869, "sources": ["https://en.wikipedia.org/wiki/War_and_Peace"]},
    {"title": "Karamazovin veljekset", "author": "Fjodor Dostojevski", "year": 1880, "sources": ["https://en.wikipedia.org/wiki/The_Brothers_Karamazov"]},
    {"title": "Kurjat", "author": "Victor Hugo", "year": 1862, "sources": ["https://en.wikipedia.org/wiki/Les_Mis%C3%A9rables"]},
    {"title": "Pähkinänsärkijä ja Hiirikuningas", "author": "E. T. A. Hoffmann", "year": 1816, "sources": ["https://en.wikipedia.org/wiki/The_Nutcracker_and_the_Mouse_King"]},
    {"title": "Heidi", "author": "Johanna Spyri", "year": 1880, "sources": ["https://en.wikipedia.org/wiki/Heidi"], "yearEnd": 1881, "note": "Teoksen kaksi alkuperäistä osaa ilmestyivät vuosina 1880 ja 1881."},
    {"title": "Robinson Crusoe", "author": "Daniel Defoe", "year": 1719, "sources": ["https://en.wikipedia.org/wiki/Robinson_Crusoe"]},
    {"title": "Me", "author": "Jevgeni Zamjatin", "year": 1924, "sources": ["https://en.wikipedia.org/wiki/We_%28novel%29"]},
    {"title": "Cthulhun kutsu", "author": "H. P. Lovecraft", "year": 1928, "sources": ["https://en.wikipedia.org/wiki/The_Call_of_Cthulhu"]},
    {"title": "Oliver Twist", "author": "Charles Dickens", "year": 1838, "sources": ["https://en.wikipedia.org/wiki/Oliver_Twist"]},
    {"title": "Ozin velho", "author": "L. Frank Baum", "year": 1900, "sources": ["https://en.wikipedia.org/wiki/The_Wonderful_Wizard_of_Oz"]},
    {"title": "Pollyanna", "author": "Eleanor H. Porter", "year": 1913, "sources": ["https://en.wikipedia.org/wiki/Pollyanna"]},
    {"title": "Peter Pan", "author": "J. M. Barrie", "year": 1911, "sources": ["https://en.wikipedia.org/wiki/Peter_and_Wendy"], "note": "Romaanin ilmestymisvuosi. Peter Pan -näytelmä esitettiin ensi kerran vuonna 1904."},
    {"title": "Tulipunainen tutkimus", "author": "Arthur Conan Doyle", "year": 1887, "sources": ["https://en.wikipedia.org/wiki/A_Study_in_Scarlet"]},
    {"title": "Minun Ántoniani", "author": "Willa Cather", "year": 1918, "sources": ["https://en.wikipedia.org/wiki/My_%C3%81ntonia"]},
    {"title": "Kelpo sotilas", "author": "Ford Madox Ford", "year": 1915, "sources": ["https://en.wikipedia.org/wiki/The_Good_Soldier"]},
    {"title": "Vailla nimeä", "author": "Wilkie Collins", "year": 1862, "sources": ["https://en.wikipedia.org/wiki/No_Name_%28novel%29"]},
    {"title": "Mansfield Park", "author": "Jane Austen", "year": 1814, "sources": ["https://en.wikipedia.org/wiki/Mansfield_Park"]},
    {"title": "Gulliverin matkat", "author": "Jonathan Swift", "year": 1726, "sources": ["https://en.wikipedia.org/wiki/Gulliver%27s_Travels"]},
    {"title": "Siepattu", "author": "Robert Louis Stevenson", "year": 1886, "sources": ["https://en.wikipedia.org/wiki/Kidnapped_%28novel%29"]},
    {"title": "Peukaloisen retket", "author": "Selma Lagerlöf", "year": 1906, "sources": ["https://en.wikipedia.org/wiki/The_Wonderful_Adventures_of_Nils"], "yearEnd": 1907, "note": "Teoksen kaksi alkuperäistä osaa ilmestyivät vuosina 1906 ja 1907."},
    {"title": "Samettipupu", "author": "Margery Williams Bianco", "year": 1922, "sources": ["https://en.wikipedia.org/wiki/The_Velveteen_Rabbit"]},
    {"title": "Jaakko ja pavunvarsi", "author": "Joseph Jacobs (toim.)", "year": 1890, "sources": ["https://books.google.com/books/about/English_fairy_tales_collected_by_J_Jacob.html?id=_-EOAAAAQAAJ"], "note": "Joseph Jacobsin kirjallinen versio kokoelmassa English Fairy Tales. Kansansatu on tätä vanhempi."},
    {"title": "Kolme pientä porsasta", "author": "Joseph Jacobs (toim.)", "year": 1890, "sources": ["https://books.google.com/books/about/English_fairy_tales_collected_by_J_Jacob.html?id=_-EOAAAAQAAJ"], "note": "Joseph Jacobsin kirjallinen versio kokoelmassa English Fairy Tales. Kansansatu on tätä vanhempi."},
    {"title": "Pikkuprinssi", "author": "Antoine de Saint-Exupéry", "year": 1943, "sources": ["https://en.wikipedia.org/wiki/The_Little_Prince"]},
    {"title": "Joulupukin elämä ja seikkailut", "author": "L. Frank Baum", "year": 1902, "sources": ["https://en.wikipedia.org/wiki/The_Life_and_Adventures_of_Santa_Claus"]},
    {"title": "Punahilkka", "author": "Jacob ja Wilhelm Grimm", "year": 1812, "sources": ["https://en.wikipedia.org/wiki/Little_Red_Riding_Hood"], "note": "Grimmin veljesten kirjallinen versio. Satu on tätä vanhempi."},
    {"title": "Tähkäpää", "author": "Jacob ja Wilhelm Grimm", "year": 1812, "sources": ["https://en.wikipedia.org/wiki/Rapunzel"], "note": "Grimmin veljesten kirjallinen versio. Satu on tätä vanhempi."},
    {"title": "Prinsessa Ruusunen", "author": "Jacob ja Wilhelm Grimm", "year": 1812, "sources": ["https://en.wikipedia.org/wiki/Sleeping_Beauty"], "note": "Grimmin veljesten kirjallinen versio. Satu on tätä vanhempi."},
    {"title": "Bremenin soittoniekat", "author": "Jacob ja Wilhelm Grimm", "year": 1819, "sources": ["https://en.wikipedia.org/wiki/Town_Musicians_of_Bremen"], "note": "Grimmin veljesten kirjallinen versio. Satu on tätä vanhempi."},
    {"title": "Sammakkoprinssi", "author": "Jacob ja Wilhelm Grimm", "year": 1812, "sources": ["https://en.wikipedia.org/wiki/The_Frog_Prince"], "note": "Grimmin veljesten kirjallinen versio. Satu on tätä vanhempi."},
    {"title": "Prinsessa ja herne", "author": "H. C. Andersen", "year": 1835, "sources": ["https://en.wikipedia.org/wiki/The_Princess_and_the_Pea"]},
    {"title": "Keisarin uudet vaatteet", "author": "H. C. Andersen", "year": 1837, "sources": ["https://en.wikipedia.org/wiki/The_Emperor%27s_New_Clothes"]},
    {"title": "Vakaa tinasotamies", "author": "H. C. Andersen", "year": 1838, "sources": ["https://en.wikipedia.org/wiki/The_Steadfast_Tin_Soldier"]},
    {"title": "Pieni tulitikkutyttö", "author": "H. C. Andersen", "year": 1845, "sources": ["https://en.wikipedia.org/wiki/The_Little_Match_Girl"], "note": "Satu ilmestyi joulukuussa 1845 vuoden 1846 kalenterissa."},
    {"title": "Tohtori Jekyllin ja herra Hyden merkillinen tapaus", "author": "Robert Louis Stevenson", "year": 1886, "sources": ["https://en.wikipedia.org/wiki/Strange_Case_of_Dr_Jekyll_and_Mr_Hyde"]},
    {"title": "Viidakkokirja", "author": "Rudyard Kipling", "year": 1894, "sources": ["https://en.wikipedia.org/wiki/The_Jungle_Book"]},
    {"title": "Huckleberry Finnin seikkailut", "author": "Mark Twain", "year": 1884, "sources": ["https://en.wikipedia.org/wiki/Adventures_of_Huckleberry_Finn"]},
    {"title": "Tom Sawyerin seikkailut", "author": "Mark Twain", "year": 1876, "sources": ["https://en.wikipedia.org/wiki/The_Adventures_of_Tom_Sawyer"]},
    {"title": "Uljas Musta", "author": "Anna Sewell", "year": 1877, "sources": ["https://en.wikipedia.org/wiki/Black_Beauty"]},
    {"title": "Kadonnut maailma", "author": "Arthur Conan Doyle", "year": 1912, "sources": ["https://en.wikipedia.org/wiki/The_Lost_World_%28Conan_Doyle_novel%29"]},
    {"title": "Ivanhoe", "author": "Walter Scott", "year": 1819, "sources": ["https://en.wikipedia.org/wiki/Ivanhoe"], "note": "Teos ilmestyi joulukuussa 1819, vaikka nimiölehdellä on vuosi 1820."},
    {"title": "Kolme muskettisoturia", "author": "Alexandre Dumas; Auguste Maquet", "year": 1844, "sources": ["https://en.wikipedia.org/wiki/The_Three_Musketeers"]},
    {"title": "Anna Karenina", "author": "Leo Tolstoi", "year": 1878, "sources": ["https://en.wikipedia.org/wiki/Anna_Karenina"]},
    {"title": "Nummisuutarit", "author": "Aleksis Kivi", "year": 1864, "sources": ["https://fi.wikipedia.org/wiki/Nummisuutarit"]},
    {"title": "Juha", "author": "Juhani Aho", "year": 1911, "sources": ["https://fi.wikipedia.org/wiki/Juha_%28romaani%29"]},
    {"title": "Paljain jaloin", "author": "Uuno Kailas", "year": 1928, "sources": ["https://www.gutenberg.org/ebooks/72899"]},
    {"title": "Pimeänpirtin hävitys", "author": "Maila Talvio", "year": 1901, "sources": ["https://fi.wikipedia.org/wiki/Maila_Talvio"]},
    {"title": "Lapsia", "author": "Teuvo Pakkala", "year": 1895, "sources": ["https://www.doria.fi/handle/10024/100792"]},
    {"title": "Puukkojunkkarit", "author": "Santeri Alkio", "year": 1894, "sources": ["https://fi.wikipedia.org/wiki/Puukkojunkkarit"]},
    {"title": "Kun on tunteet", "author": "Maria Jotuni", "year": 1913, "sources": ["https://fi.wikipedia.org/wiki/Maria_Jotuni"]},
    {"title": "Kiljusen herrasväki", "author": "Jalmari Finne", "year": 1914, "sources": ["https://fi.wikipedia.org/wiki/Kiljusen_herrasv%C3%A4ki"]},
    {"title": "Laulu tulipunaisesta kukasta", "author": "Johannes Linnankoski", "year": 1905, "sources": ["https://fi.wikipedia.org/wiki/Johannes_Linnankoski"]},
    {"title": "Tulitikkuja lainaamassa", "author": "Maiju Lassila", "year": 1910, "sources": ["https://fi.wikipedia.org/wiki/Maiju_Lassila"]},
    {"title": "Sata ja yksi laulua; Hiihtäjän virsiä; Pyhä kevät", "author": "Eino Leino", "year": 1898, "sources": ["https://www.finna.fi/Record/digi.6848", "https://www.doria.fi/handle/10024/100815", "https://www.kainuuneinoleinoseura.fi/eino-leino/runoteokset/"], "yearEnd": 1901, "note": "Yhteisnide: Sata ja yksi laulua (1898), Hiihtäjän virsiä (1900) ja Pyhä kevät (1901). Järjestys käyttää varhaisimman kokoelman vuotta."},
    {"title": "Vänrikki Stoolin tarinat", "author": "J. L. Runeberg", "year": 1848, "sources": ["https://en.wikipedia.org/wiki/The_Tales_of_Ensign_St%C3%A5l"], "yearEnd": 1860, "note": "Alkuteoksen ensimmäinen osa ilmestyi vuonna 1848, toinen vuonna 1860. Suomennoksen vuosi ei määrää järjestystä."},
    {"title": "Kalevala", "author": "Elias Lönnrot", "year": 1849, "sources": ["https://en.wikipedia.org/wiki/Kalevala"], "note": "Palvelun teksti on Uusi Kalevala (1849). Sitä edeltävä Vanha Kalevala ilmestyi vuonna 1835."},
    {"title": "Huligaani ynnä muita kertoelmia", "author": "Arvid Järnefelt", "year": 1926, "sources": ["https://fi.wikipedia.org/wiki/Arvid_J%C3%A4rnefelt"]},
    {"title": "Työmiehen vaimo", "author": "Minna Canth", "year": 1885, "sources": ["https://fi.wikipedia.org/wiki/Ty%C3%B6miehen_vaimo"]},
    {"title": "Yksin", "author": "Juhani Aho", "year": 1890, "sources": ["https://fi.wikipedia.org/wiki/Juhani_Aho"]},
    {"title": "Anna Liisa; Kotoa pois", "author": "Minna Canth", "year": 1895, "sources": ["https://fi.wikipedia.org/wiki/Minna_Canth"], "note": "Yhteisniteen molemmat alkuteokset, Anna Liisa ja Kotoa pois, ilmestyivät vuonna 1895."},
    {"title": "Lastuja I–III", "author": "Juhani Aho", "year": 1891, "sources": ["https://fi.wikipedia.org/wiki/Juhani_Aho", "https://juhaniahonseura.yhdistysavain.fi/linkit-lastut/"], "yearEnd": 1896, "note": "Lastuja I–III ilmestyivät vuosina 1891, 1892 ja 1896. Järjestys käyttää ensimmäisen kokoelman vuotta."},
    {"title": "Suomen kansan satuja ja tarinoita", "author": "Eero Salmelainen", "year": 1852, "sources": ["https://data.nationallibrary.fi/bib/me/W00115680800"], "yearEnd": 1866, "note": "Salmelaisen neliosaisen kokoelman osat ilmestyivät vuosina 1852, 1854, 1863 ja 1866. Kansansatujen suullinen perinne on tätä vanhempi."},
    {"title": "Karavaani ja muita juttuja", "author": "Pentti Haanpää", "year": 1930, "sources": ["https://www.gutenberg.org/ebooks/78018"]},
    {"title": "Seitsemän veljestä", "author": "Aleksis Kivi", "year": 1870, "sources": ["https://en.wikipedia.org/wiki/Seven_Brothers"]},
    {"title": "Agnes", "author": "Minna Canth", "year": 1892, "sources": ["https://fi.wikipedia.org/wiki/Agnes_%28novelli%29"]},
    {"title": "Putkinotko", "author": "Joel Lehtonen", "year": 1919, "sources": ["https://fi.wikipedia.org/wiki/Putkinotko"], "yearEnd": 1920, "note": "Romaanin kaksi alkuperäistä osaa ilmestyivät vuosina 1919 ja 1920."},
    {"title": "Rautatie", "author": "Juhani Aho", "year": 1884, "sources": ["https://fi.wikipedia.org/wiki/Rautatie_%28romaani%29"]},
    {"title": "Lintukoto: Muutamia päiväkirjan lehtiä", "author": "Joel Lehtonen", "year": 1929, "sources": ["https://www.finna.fi/Record/utu.9914918205405971"]},
    {"title": "Kultahattu", "author": "F. Scott Fitzgerald", "year": 1925, "sources": ["https://en.wikipedia.org/wiki/The_Great_Gatsby"]},
    {"title": "Rikos ja rangaistus", "author": "Fjodor Dostojevski", "year": 1866, "sources": ["https://en.wikipedia.org/wiki/Crime_and_Punishment"]},
    {"title": "Humiseva harju", "author": "Emily Brontë", "year": 1847, "sources": ["https://en.wikipedia.org/wiki/Wuthering_Heights"]},
    {"title": "Pikku naisia", "author": "Louisa May Alcott", "year": 1868, "sources": ["https://en.wikipedia.org/wiki/Little_Women"], "yearEnd": 1869, "note": "Teoksen kaksi alkuperäistä osaa ilmestyivät vuosina 1868 ja 1869."},
    {"title": "Liisa Ihmemaassa", "author": "Lewis Carroll", "year": 1865, "sources": ["https://en.wikipedia.org/wiki/Alice%27s_Adventures_in_Wonderland"]},
    {"title": "Dorian Grayn muotokuva", "author": "Oscar Wilde", "year": 1891, "sources": ["https://en.wikipedia.org/wiki/The_Picture_of_Dorian_Gray"], "note": "Laajennettu romaaniversio ilmestyi vuonna 1891. Lyhyempi lehtiversio ilmestyi vuonna 1890."},
    {"title": "Dracula", "author": "Bram Stoker", "year": 1897, "sources": ["https://en.wikipedia.org/wiki/Dracula"]},
    {"title": "Frankenstein eli uusi Prometheus", "author": "Mary Shelley", "year": 1818, "sources": ["https://en.wikipedia.org/wiki/Frankenstein"]},
    {"title": "Matka maan keskipisteeseen", "author": "Jules Verne", "year": 1864, "sources": ["https://en.wikipedia.org/wiki/Journey_to_the_Center_of_the_Earth"]},
    {"title": "Maailman ympäri kahdeksassakymmenessä päivässä", "author": "Jules Verne", "year": 1873, "sources": ["https://en.wikipedia.org/wiki/Around_the_World_in_Eighty_Days"]},
    {"title": "Erämaan kutsu", "author": "Jack London", "year": 1903, "sources": ["https://en.wikipedia.org/wiki/The_Call_of_the_Wild"]},
    {"title": "Valkohammas", "author": "Jack London", "year": 1906, "sources": ["https://en.wikipedia.org/wiki/White_Fang"]},
    {"title": "Hamlet", "author": "William Shakespeare", "year": 1603, "sources": ["https://en.wikipedia.org/wiki/Hamlet"], "note": "Ensimmäinen painettu Hamlet-laitos ilmestyi vuonna 1603."},
    {"title": "Romeo ja Julia", "author": "William Shakespeare", "year": 1597, "sources": ["https://en.wikipedia.org/wiki/Romeo_and_Juliet"]},
    {"title": "1984", "author": "George Orwell", "year": 1949, "sources": ["https://en.wikipedia.org/wiki/Nineteen_Eighty-Four"]},
    {"title": "Maailmojen sota", "author": "H. G. Wells", "year": 1898, "sources": ["https://en.wikipedia.org/wiki/The_War_of_the_Worlds"]},
    {"title": "Baskervillen koira", "author": "Arthur Conan Doyle", "year": 1902, "sources": ["https://en.wikipedia.org/wiki/The_Hound_of_the_Baskervilles"]},
    {"title": "Sherlock Holmesin seikkailut", "author": "Arthur Conan Doyle", "year": 1892, "sources": ["https://en.wikipedia.org/wiki/The_Adventures_of_Sherlock_Holmes"]},
    {"title": "Ylpeys ja ennakkoluulo", "author": "Jane Austen", "year": 1813, "sources": ["https://en.wikipedia.org/wiki/Pride_and_Prejudice"]},
    {"title": "Saiturin joulu", "author": "Charles Dickens", "year": 1843, "sources": ["https://en.wikipedia.org/wiki/A_Christmas_Carol"]},
    {"title": "Salamanterisota", "author": "Karel Čapek", "year": 1936, "sources": ["https://en.wikipedia.org/wiki/War_with_the_Newts"]},
    {"title": "R.U.R.", "author": "Karel Čapek", "year": 1920, "sources": ["https://en.wikipedia.org/wiki/R.U.R."]},
    {"title": "Järki ja tunteet", "author": "Jane Austen", "year": 1811, "sources": ["https://en.wikipedia.org/wiki/Sense_and_Sensibility"]},
    {"title": "Aarresaari", "author": "Robert Louis Stevenson", "year": 1883, "sources": ["https://en.wikipedia.org/wiki/Treasure_Island"]},
    {"title": "Moby Dick eli valas", "author": "Herman Melville", "year": 1851, "sources": ["https://en.wikipedia.org/wiki/Moby-Dick"]},
    {"title": "Kaislikossa suhisee", "author": "Kenneth Grahame", "year": 1908, "sources": ["https://en.wikipedia.org/wiki/The_Wind_in_the_Willows"]},
    {"title": "Pinokkion seikkailut", "author": "Carlo Collodi", "year": 1883, "sources": ["https://en.wikipedia.org/wiki/The_Adventures_of_Pinocchio"]},
    {"title": "Eläinten vallankumous", "author": "George Orwell", "year": 1945, "sources": ["https://en.wikipedia.org/wiki/Animal_Farm"]}
  ];
  const fold = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const titleKey = value => fold(String(value || "").replace(/\s*\((?:versio\s+)?v\d+(?:\.\d+)*\)\s*$/iu, "").replace(/\s*[–—-]\s*äänikirja\s*$/iu, ""));
  const identityKey = work => `${titleKey(work.title)}|${fold(work.author)}`;
  const byIdentity = new Map(records.map(record => [identityKey(record), record]));
  const collator = new Intl.Collator("fi", { numeric: true, sensitivity: "base" });
  const isChronologicalSort = sort => sort === "original-oldest" || sort === "original-newest";

  function integer(value, maximum) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : null;
  }

  function normalizeDate(date) {
    const year = integer(Math.abs(Number(date.year)), 9999);
    const century = integer(date.century, 100);
    if (!year && !century) return null;
    const bce = date.era === "bce" || Number(date.year) < 0;
    const end = integer(date.yearEnd, 9999);
    const yearEnd = year && end && (bce ? end <= year : end >= year) ? end : null;
    const approximate = !year || Boolean(date.approximate);
    const era = bce ? "bce" : "ce";
    const sortYear = year ? (bce ? -year : year) : (bce ? -(century * 100 - 50) : century * 100 - 50);
    const label = (year ? `${year}${yearEnd && yearEnd !== year ? `–${yearEnd}` : ""}` : `${century}. vuosisata`)
      + (bce ? " eaa." : "") + (approximate ? " (arvio)" : "");
    return { year, yearEnd, century: year ? null : century, era, approximate, sortYear, label,
      note: String(date.note || ""), sources: (date.sources || []).filter(source => typeof source === "string" && source.startsWith("https://")) };
  }

  function forWork(work) {
    if (!work) return null;
    const source = work.raw || work;
    const explicit = normalizeDate({
      year: source.original_publication_year,
      yearEnd: source.original_publication_year_end,
      century: source.original_publication_century,
      era: source.original_publication_era,
      approximate: source.original_publication_estimated === true,
    });
    if (explicit) return explicit;
    const record = byIdentity.get(identityKey({
      title: work.title || source.title || source.name || source.work_title,
      author: work.author || source.author || source.creator || source.author_name,
    }));
    return record ? normalizeDate(record) : null;
  }

  function sortWorks(works, sort) {
    if (!isChronologicalSort(sort)) return [...works];
    const dated = works.map(work => ({ work, date: forWork(work) }));
    dated.sort((a, b) => {
      // Unknown dates remain last in both directions. Century midpoints are
      // comparison keys only; the UI always says that the century is an estimate.
      if (!a.date || !b.date) {
        if (a.date) return -1;
        if (b.date) return 1;
      } else {
        const difference = a.date.sortYear - b.date.sortYear;
        if (difference) return sort === "original-newest" ? -difference : difference;
      }
      return collator.compare(a.work.title || "", b.work.title || "")
        || collator.compare(a.work.author || "", b.work.author || "")
        || collator.compare(String(a.work.id || ""), String(b.work.id || ""));
    });
    return dated.map(item => item.work);
  }

  const api = { records, forWork, sortWorks, isChronologicalSort };
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SkriptLabLibraryPublication = api;
})(typeof window === "undefined" ? {} : window);

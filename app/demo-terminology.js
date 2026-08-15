(function (root) {
  "use strict";

  const replacements = [
    [/kehityseditointipalautteessa/giu, "kehityspalautteessa"],
    [/kehityseditointipalautteesta/giu, "kehityspalautteesta"],
    [/kehityseditointipalautteeseen/giu, "kehityspalautteeseen"],
    [/kehityseditointipalautteen/giu, "kehityspalautteen"],
    [/kehityseditointipalautetta/giu, "kehityspalautetta"],
    [/kehityseditointipalaute/giu, "kehityspalaute"],
    [/kehityseditoinnissa/giu, "kehityspalautteessa"],
    [/kehityseditoinnista/giu, "kehityspalautteesta"],
    [/kehityseditointiin/giu, "kehityspalautteeseen"],
    [/kehityseditoinnin/giu, "kehityspalautteen"],
    [/kehityseditointia/giu, "kehityspalautetta"],
    [/kehityseditointi/giu, "kehityspalaute"],
    [/kehityseditoijalle/giu, "palautteelle"],
    [/kehityseditoija/giu, "palauteavustin"],
    [/toimituksellisen arvion/giu, "kokonaisarvion"],
    [/toimituksellinen arvio/giu, "kokonaisarvio"],
    [/toimituksellinen palaute/giu, "kehityspalaute"],
    [/toimituksellinen työvaihe/giu, "tekstin kehitysvaihe"],
    [/toimitusanalyysin/giu, "kokonaisanalyysin"],
    [/toimitusanalyysi/giu, "kokonaisanalyysi"],
    [/toimitusformaattien/giu, "tiedostomuotojen"],
    [/toimitusformaatit/giu, "tiedostomuodot"],
    [/toimitusformaattia/giu, "tiedostomuotoa"],
    [/toimitusformaatti/giu, "tiedostomuoto"],
    [/toimituspaketin/giu, "tiedostopaketin"],
    [/toimituspakettiin/giu, "tiedostopakettiin"],
    [/toimituspaketti/giu, "tiedostopaketti"],
    [/toimituksen jatkotyöskentelyyn/giu, "jatkotyöskentelyyn"],
    [/toimitettavan/giu, "pakettiin tulevan"],
    [/toimitettava/giu, "pakettiin tuleva"],
    [/toimitusvalmis/giu, "valmis"],
    [/toimituksell/giu, "sisällöll"],
    [/työpöytäeditori/giu, "tekstityötila"],
    [/editorin käyttöön/giu, "työtilan käyttöön"],
    [/editorin käytössä/giu, "työtilan käytössä"],
    [/editorin/giu, "työtilan"],
    [/editorille/giu, "työtilaan"],
    [/editoriin/giu, "tekstityötilaan"],
    [/käsikirjoituksestasi/giu, "tekstistäsi"],
    [/käsikirjoitukseenne/giu, "tekstiinne"],
    [/käsikirjoituksemme/giu, "tekstimme"],
    [/käsikirjoituksensa/giu, "tekstinsä"],
    [/käsikirjoituksesi/giu, "tekstisi"],
    [/käsikirjoitukseni/giu, "tekstini"],
    [/käsikirjoituksissa/giu, "teksteissä"],
    [/käsikirjoituksista/giu, "teksteistä"],
    [/käsikirjoituksiin/giu, "teksteihin"],
    [/käsikirjoituksille/giu, "teksteille"],
    [/käsikirjoituksien/giu, "tekstien"],
    [/käsikirjoitusten/giu, "tekstien"],
    [/käsikirjoituksia/giu, "tekstejä"],
    [/käsikirjoitukseen/giu, "tekstiin"],
    [/käsikirjoituksesta/giu, "tekstistä"],
    [/käsikirjoituksessa/giu, "tekstissä"],
    [/käsikirjoitukselle/giu, "tekstille"],
    [/käsikirjoitukselta/giu, "tekstiltä"],
    [/käsikirjoituksella/giu, "tekstillä"],
    [/käsikirjoitukseksi/giu, "tekstiksi"],
    [/käsikirjoituksena/giu, "tekstinä"],
    [/käsikirjoituksen/giu, "tekstin"],
    [/käsikirjoitukset/giu, "tekstit"],
    [/käsikirjoitusta/giu, "tekstiä"],
    [/käsikirjoitus/giu, "teksti"],
    [/metatiedoille/giu, "tekstitiedoille"],
    [/metatiedoista/giu, "tekstitiedoista"],
    [/metatietoihin/giu, "tekstitietoihin"],
    [/metatietojen/giu, "tekstitietojen"],
    [/metatiedot/giu, "tekstin tiedot"],
    [/metadata/giu, "projektitiedot"],
    [/monikieliseen julkaisuun/giu, "kieliversioihin"],
    [/julkaisukelpoisen/giu, "jatkotyöhön valmiin"],
    [/julkaisukelpoinen/giu, "jatkotyöhön valmis"],
    [/julkaisupolun/giu, "etenemisen"],
    [/julkaisupolku/giu, "eteneminen"],
    [/julkaisuformaattien/giu, "tiedostomuotojen"],
    [/julkaisuformaatit/giu, "tiedostomuodot"],
    [/julkaisuformaattia/giu, "tiedostomuotoa"],
    [/julkaisuformaatti/giu, "tiedostomuoto"],
    [/julkaisupaketin/giu, "tiedostopaketin"],
    [/julkaisupaketti/giu, "tiedostopaketti"],
    [/julkaisuvalmius/giu, "valmius"],
    [/julkaistavaksi/giu, "jaettavaksi"],
    [/julkaisemiseen/giu, "jakamiseen"],
    [/julkaiseminen/giu, "jakaminen"],
    [/painovalmis pdf/giu, "viimeistelty PDF"],
    [/painovalmiin pdf:n/giu, "viimeistellyn PDF:n"],
    [/painovalmis/giu, "viimeistelty"],
    [/painokannen/giu, "kansitiedoston"],
    [/painokansi/giu, "kansitiedosto"],
    [/painotalon/giu, "toteuttajan"],
    [/painotalo/giu, "toteuttaja"],
    [/kustantamiseen/giu, "jatkotyöhön"],
    [/kustantaminen/giu, "jatkotyö"],
    [/kustantamolle/giu, "vastaanottajalle"],
    [/kustantamon/giu, "organisaation"],
    [/kustantajalle/giu, "vastaanottajalle"],
    [/kustantajan/giu, "vastaanottajan"],
    [/kustantaja/giu, "vastaanottaja"],
    [/\bONIX\b/gu, "Tiedot"],
    [/\bISBN\b/gu, "Tunniste"],
  ];

  const skippedTextParents = "script, style, noscript, template, textarea, input, pre, code, [contenteditable='true'], [data-demo-terminology-preserve]";
  const visibleAttributes = ["aria-label", "placeholder", "title", "alt"];

  function matchCase(source, replacement) {
    const sourceText = String(source || "");
    if (sourceText && sourceText === sourceText.toLocaleUpperCase("fi-FI")) {
      return replacement.toLocaleUpperCase("fi-FI");
    }
    const first = sourceText.charAt(0);
    if (first && first === first.toLocaleUpperCase("fi-FI") && first !== first.toLocaleLowerCase("fi-FI")) {
      return replacement.charAt(0).toLocaleUpperCase("fi-FI") + replacement.slice(1);
    }
    return replacement;
  }

  function neutralize(value) {
    let text = String(value == null ? "" : value);
    replacements.forEach(([pattern, replacement]) => {
      text = text.replace(pattern, match => matchCase(match, replacement));
    });
    return text;
  }

  function shouldSkipTextNode(node) {
    const parent = node && node.parentElement;
    return !parent || Boolean(parent.closest(skippedTextParents));
  }

  function apply(rootNode) {
    const scope = rootNode && rootNode.nodeType ? rootNode : root.document;
    if (!scope || !root.document) return;

    const textRoot = scope.nodeType === 9 ? scope.body || scope.documentElement : scope;
    if (textRoot) {
      const walker = root.document.createTreeWalker(textRoot, root.NodeFilter.SHOW_TEXT);
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);
      textNodes.forEach(node => {
        if (shouldSkipTextNode(node)) return;
        const next = neutralize(node.nodeValue);
        if (next !== node.nodeValue) node.nodeValue = next;
      });
    }

    const elements = [];
    if (scope.nodeType === 1) elements.push(scope);
    const queryRoot = scope.querySelectorAll ? scope : root.document;
    queryRoot.querySelectorAll("[aria-label], [placeholder], [title], [alt]").forEach(element => elements.push(element));
    elements.forEach(element => {
      visibleAttributes.forEach(attribute => {
        if (!element.hasAttribute(attribute)) return;
        const current = element.getAttribute(attribute);
        const next = neutralize(current);
        if (next !== current) element.setAttribute(attribute, next);
      });
    });
  }

  root.SkriptLabDemoTerminology = Object.freeze({ neutralize, apply });
})(window);

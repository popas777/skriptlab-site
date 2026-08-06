/*
 * Suomenkielinen, leveyden huomioiva tavutus SkriptLabin taittoesikatseluun.
 *
 * Selain:
 *   window.SkriptLabFinnishHyphenation.layoutText(text, options)
 *
 * Node/CommonJS:
 *   const hyphenation = require("./finnish-hyphenation.js");
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SkriptLabFinnishHyphenation = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SOFT_HYPHEN = "\u00ad";
  var VOWELS = "aeiouyäöåAEIOUYÄÖÅ";
  var DIPHTHONGS = Object.freeze({
    ai: true,
    ei: true,
    oi: true,
    ui: true,
    yi: true,
    äi: true,
    öi: true,
    au: true,
    eu: true,
    iu: true,
    ou: true,
    ey: true,
    äy: true,
    öy: true,
    iy: true,
    ie: true,
    uo: true,
    yö: true,
  });

  // minWordLength / minEdge / maxSpaceRatio
  var LEVELS = Object.freeze({
    none: Object.freeze({
      minWordLength: Infinity,
      minEdge: Infinity,
      maxSpaceRatio: Infinity,
    }),
    light: Object.freeze({
      minWordLength: 9,
      minEdge: 4,
      maxSpaceRatio: 2.4,
    }),
    balanced: Object.freeze({
      minWordLength: 7,
      minEdge: 3,
      maxSpaceRatio: 1.9,
    }),
    strong: Object.freeze({
      minWordLength: 5,
      minEdge: 2,
      maxSpaceRatio: 1.5,
    }),
  });

  // Pienikirjaiminen alias helpottaa API:n tutkimista selaimen konsolissa.
  var profiles = LEVELS;

  function isVowel(character) {
    return VOWELS.indexOf(character) !== -1;
  }

  function cleanSoftHyphens(value) {
    return String(value == null ? "" : value).split(SOFT_HYPHEN).join("");
  }

  function resolveLevel(level) {
    return Object.prototype.hasOwnProperty.call(LEVELS, level)
      ? level
      : "balanced";
  }

  /**
   * Palauttaa kaikki suomen tavusääntöjen mukaiset rajat ennen indeksin
   * merkkiä. Toteutus vastaa backend/proofread/hyphenation.py:n sääntöjä.
   */
  function syllableBreaks(word) {
    var lowered = cleanSoftHyphens(word).toLowerCase();
    var length = lowered.length;
    var breaks = [];
    var i = 0;

    while (i < length - 1) {
      var current = lowered[i];
      var next = lowered[i + 1];

      if (isVowel(current) && !isVowel(next)) {
        var j = i + 1;
        while (j < length && !isVowel(lowered[j])) {
          j += 1;
        }
        if (j < length) {
          // Konsonanttijaksossa raja tulee viimeisen konsonantin eteen.
          breaks.push(j - 1);
        }
        i = j - 1 > i ? j - 1 : i + 1;
        continue;
      }

      if (isVowel(current) && isVowel(next)) {
        var pair = current + next;
        var same = current === next;
        if (!same && !DIPHTHONGS[pair]) {
          breaks.push(i + 1);
        }
        i += 1;
        continue;
      }

      i += 1;
    }

    return breaks;
  }

  /**
   * Suodattaa tavurajat valitun taittoprofiilin sana- ja reunaehdoilla.
   */
  function allowedBreaks(word, level) {
    var cleanWord = cleanSoftHyphens(word);
    var resolvedLevel = resolveLevel(level);
    var profile = LEVELS[resolvedLevel];

    if (resolvedLevel === "none" || cleanWord.length < profile.minWordLength) {
      return [];
    }

    return syllableBreaks(cleanWord).filter(function (position) {
      return (
        position >= profile.minEdge &&
        cleanWord.length - position >= profile.minEdge
      );
    });
  }

  function finiteNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  function makeWidthReader(measureText) {
    var reader = typeof measureText === "function"
      ? measureText
      : function (value) {
          return String(value).length;
        };

    return function (value) {
      var measured = reader(String(value));
      var width = measured && typeof measured === "object"
        ? measured.width
        : measured;
      return finiteNumber(width) && width >= 0 ? width : 0;
    };
  }

  function paragraphSlices(text) {
    var slices = [];
    var newlinePattern = /\r\n|\n|\r/g;
    var start = 0;
    var match;

    while ((match = newlinePattern.exec(text)) !== null) {
      slices.push({ text: text.slice(start, match.index), start: start });
      start = match.index + match[0].length;
    }
    slices.push({ text: text.slice(start), start: start });
    return slices;
  }

  function wordBreakCandidates(unit, level) {
    var candidates = [];
    var wordPattern = /[A-Za-zÅÄÖåäö]+/g;
    var match;

    while ((match = wordPattern.exec(unit)) !== null) {
      var word = match[0];
      allowedBreaks(word, level).forEach(function (position) {
        candidates.push({
          unitIndex: match.index + position,
          word: word,
          wordPosition: position,
          prefix: word.slice(0, position),
          remainder: word.slice(position),
        });
      });
    }

    return candidates;
  }

  function lineWidth(itemWidths, baseSpaceWidth) {
    var width = 0;
    for (var i = 0; i < itemWidths.length; i += 1) {
      width += itemWidths[i];
    }
    if (itemWidths.length > 1) {
      width += (itemWidths.length - 1) * baseSpaceWidth;
    }
    return width;
  }

  function justifiedSpaceRatio(itemWidths, widthLimit, baseSpaceWidth) {
    var gapCount = itemWidths.length - 1;
    if (gapCount <= 0) {
      return Infinity;
    }

    var wordsWidth = 0;
    for (var i = 0; i < itemWidths.length; i += 1) {
      wordsWidth += itemWidths[i];
    }
    var requiredSpaceWidth = (widthLimit - wordsWidth) / gapCount;
    if (baseSpaceWidth <= 0) {
      return requiredSpaceWidth > 0 ? Infinity : 0;
    }
    return requiredSpaceWidth / baseSpaceWidth;
  }

  function longestFittingBreak(state, currentWidth, hasLineItems, widthLimit, widthOf) {
    var gapWidth = hasLineItems ? state.spaceWidth : 0;

    // Rajat ovat tekstijärjestyksessä. Käydään ne lopusta, jotta valinta on
    // aina pisin sallittu ja mahtuva alkuosa.
    for (var i = state.candidates.length - 1; i >= 0; i -= 1) {
      var candidate = state.candidates[i];
      if (candidate.unitIndex <= state.offset) {
        continue;
      }
      var visiblePrefix = state.text.slice(state.offset, candidate.unitIndex) + "-";
      if (
        currentWidth + gapWidth + widthOf(visiblePrefix) <= widthLimit
      ) {
        return {
          candidate: candidate,
          visiblePrefix: visiblePrefix,
        };
      }
    }
    return null;
  }

  function layoutParagraph(paragraph, paragraphStart, settings, firstOutputLine) {
    var tokenPattern = /\S+/g;
    var states = [];
    var tokenMatch;

    while ((tokenMatch = tokenPattern.exec(paragraph)) !== null) {
      states.push({
        text: tokenMatch[0],
        start: paragraphStart + tokenMatch.index,
        offset: 0,
        candidates: wordBreakCandidates(tokenMatch[0], settings.level),
        spaceWidth: settings.spaceWidth,
      });
    }

    if (states.length === 0) {
      return { lines: [""], breaks: [] };
    }

    var lines = [];
    var breaks = [];
    var lineItems = [];
    var itemWidths = [];
    var stateIndex = 0;

    function currentLimit() {
      return lines.length === 0
        ? settings.firstLineWidth
        : settings.maxWidth;
    }

    function finishLine() {
      lines.push(lineItems.join(" "));
      lineItems = [];
      itemWidths = [];
    }

    while (stateIndex < states.length) {
      var state = states[stateIndex];
      var remaining = state.text.slice(state.offset);
      var remainingWidth = settings.widthOf(remaining);
      var limit = currentLimit();
      var usedWidth = lineWidth(itemWidths, settings.spaceWidth);
      var addedWidth = usedWidth + (lineItems.length ? settings.spaceWidth : 0) + remainingWidth;

      if (addedWidth <= limit || !finiteNumber(limit)) {
        lineItems.push(remaining);
        itemWidths.push(remainingWidth);
        stateIndex += 1;
        continue;
      }

      if (lineItems.length === 0) {
        // Yksittäinen ylipitkä sana tarvitsee katkaisun myös ilman
        // sanavälisuhdetta. none-profiilissa ehdokkaita ei ole.
        var mandatoryBreak = longestFittingBreak(
          state,
          0,
          false,
          limit,
          settings.widthOf
        );
        if (mandatoryBreak) {
          lineItems.push(mandatoryBreak.visiblePrefix);
          itemWidths.push(settings.widthOf(mandatoryBreak.visiblePrefix));
          breaks.push({
            index: state.start + mandatoryBreak.candidate.unitIndex,
            line: firstOutputLine + lines.length,
            level: settings.level,
            word: mandatoryBreak.candidate.word,
            position: mandatoryBreak.candidate.wordPosition,
            prefix: mandatoryBreak.candidate.prefix,
            remainder: mandatoryBreak.candidate.remainder,
          });
          state.offset = mandatoryBreak.candidate.unitIndex;
          finishLine();
          continue;
        }

        // Lyhyt tai tavuttamaton sana saa tässä poikkeustapauksessa ylittää
        // palstan: merkkejä ei katkaista suomen tavurajojen ulkopuolelta.
        lineItems.push(remaining);
        itemWidths.push(remainingWidth);
        stateIndex += 1;
        finishLine();
        continue;
      }

      var ratio = justifiedSpaceRatio(itemWidths, limit, settings.spaceWidth);
      var profile = LEVELS[settings.level];
      if (ratio > profile.maxSpaceRatio) {
        var discretionaryBreak = longestFittingBreak(
          state,
          usedWidth,
          true,
          limit,
          settings.widthOf
        );
        if (discretionaryBreak) {
          lineItems.push(discretionaryBreak.visiblePrefix);
          itemWidths.push(settings.widthOf(discretionaryBreak.visiblePrefix));
          breaks.push({
            index: state.start + discretionaryBreak.candidate.unitIndex,
            line: firstOutputLine + lines.length,
            level: settings.level,
            word: discretionaryBreak.candidate.word,
            position: discretionaryBreak.candidate.wordPosition,
            prefix: discretionaryBreak.candidate.prefix,
            remainder: discretionaryBreak.candidate.remainder,
          });
          state.offset = discretionaryBreak.candidate.unitIndex;
          finishLine();
          continue;
        }
      }

      // Nykyinen rivi suljetaan ja sama sana käsitellään uutena seuraavalla
      // kierroksella. Näin jokainen tavutus vaikuttaa kaikkiin jatkoriveihin.
      finishLine();
    }

    if (lineItems.length > 0) {
      finishLine();
    }

    return { lines: lines, breaks: breaks };
  }

  function insertSoftHyphens(text, breaks) {
    var positions = breaks
      .map(function (entry) {
        return entry.index;
      })
      .sort(function (left, right) {
        return left - right;
      });
    var result = "";
    var cursor = 0;
    var previous = -1;

    positions.forEach(function (position) {
      if (position === previous) {
        return;
      }
      result += text.slice(cursor, position) + SOFT_HYPHEN;
      cursor = position;
      previous = position;
    });
    return result + text.slice(cursor);
  }

  /**
   * Rivittää tekstin järjestyksessä ja lisää vain käytettyihin tavurajoihin
   * pehmeän tavuviivan. Rivien tavutus näkyy tavallisena '-' merkkinä.
   *
   * options:
   *   level          none | light | balanced | strong (oletus balanced)
   *   maxWidth       normaalin rivin leveys
   *   firstLineWidth ensimmäisen rivin leveys (oletus maxWidth)
   *   measureText    funktio, joka palauttaa numeron tai TextMetrics-olion
   *   spaceWidth     normaalin sanavälin leveys (oletus measureText(" "))
   *
   * Palautus: { text, lines, breaks }. break.index viittaa syötteeseen sen
   * jälkeen, kun mahdolliset vanhat pehmeät tavuviivat on poistettu.
   */
  function layoutText(text, options) {
    var cleanText = cleanSoftHyphens(text);
    var opts = options || {};
    var level = resolveLevel(opts.level);
    var widthOf = makeWidthReader(opts.measureText);
    var maxWidth = finiteNumber(opts.maxWidth) && opts.maxWidth >= 0
      ? opts.maxWidth
      : Infinity;
    var firstLineWidth = finiteNumber(opts.firstLineWidth) && opts.firstLineWidth >= 0
      ? opts.firstLineWidth
      : maxWidth;
    var measuredSpace = widthOf(" ");
    var spaceWidth = finiteNumber(opts.spaceWidth) && opts.spaceWidth >= 0
      ? opts.spaceWidth
      : measuredSpace;

    if (cleanText.length === 0) {
      return { text: "", lines: [], breaks: [] };
    }

    var settings = {
      level: level,
      maxWidth: maxWidth,
      firstLineWidth: firstLineWidth,
      widthOf: widthOf,
      spaceWidth: spaceWidth,
    };
    var lines = [];
    var breaks = [];

    paragraphSlices(cleanText).forEach(function (paragraph) {
      var result = layoutParagraph(
        paragraph.text,
        paragraph.start,
        settings,
        lines.length
      );
      Array.prototype.push.apply(lines, result.lines);
      Array.prototype.push.apply(breaks, result.breaks);
    });

    return {
      text: insertSoftHyphens(cleanText, breaks),
      lines: lines,
      breaks: breaks,
    };
  }

  return Object.freeze({
    SOFT_HYPHEN: SOFT_HYPHEN,
    LEVELS: LEVELS,
    profiles: profiles,
    syllableBreaks: syllableBreaks,
    allowedBreaks: allowedBreaks,
    layoutText: layoutText,
  });
});

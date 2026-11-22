// The editorial map is in source order. Several scenes may share one paragraph.
(function () {
  function create(bundle, primaryChapters, normalize) {
    if (bundle?.version !== 1 || !Array.isArray(bundle.editions) || !bundle.anchors?.length) {
      throw new Error("Lukuversioiden karttaa ei voitu avata.");
    }
    const editions = new Map();
    const owner = new Map();
    const byChapter = new Map();
    const rows = bundle.anchors;
    bundle.editions.forEach((edition, i) => {
      const chapters = i === 0 ? primaryChapters : normalize({ chapters: edition.chapters });
      editions.set(edition.id, { ...edition, chapters });
      chapters.forEach(chapter => {
        owner.set(chapter.id, edition.id);
        byChapter.set(chapter.id, []);
      });
    });
    rows.forEach((row, index) => {
      Object.values(row.locations).forEach(([chapterId, paragraph]) => {
        byChapter.get(chapterId).push({ paragraph, index });
      });
    });
    for (const entries of byChapter.values()) entries.sort((a, b) => a.paragraph - b.paragraph || a.index - b.index);
    function at(chapterId, paragraph) {
      const entries = byChapter.get(chapterId);
      let current = entries[0];
      for (const entry of entries) {
        if (entry.paragraph > paragraph) break;
        current = entry;
      }
      return current.index;
    }
    function targets(index, edition) {
      if (rows[index].locations[edition]) return { exact: index };
      let previous = index - 1, next = index + 1;
      while (previous >= 0 && !rows[previous].locations[edition]) previous--;
      while (next < rows.length && !rows[next].locations[edition]) next++;
      return { previous: previous >= 0 ? previous : null, next: next < rows.length ? next : null };
    }
    return { editions, owner, rows, at, targets };
  }
  window.SkriptLabReadingEditions = { create };
})();

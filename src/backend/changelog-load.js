// Changelog : remote GitHub + fusion avec changelog.json embarqué (installateur).
(function () {
  'use strict';

  var CHANGELOG_FETCH_URL = 'https://raw.githubusercontent.com/dragonal59/DarkOrbit-Stats-Tracker-Download/master/changelog.json';

  function mergeChangelogData(remote, bundled) {
    var r = (remote && remote.versions) || [];
    var b = (bundled && bundled.versions) || [];
    var byKey = {};
    b.forEach(function (e) {
      if (e && e.version != null) byKey[String(e.version)] = e;
    });
    r.forEach(function (e) {
      if (e && e.version != null) byKey[String(e.version)] = e;
    });
    var order = [];
    r.forEach(function (e) {
      var k = e && e.version != null ? String(e.version) : '';
      if (k && order.indexOf(k) === -1) order.push(k);
    });
    b.forEach(function (e) {
      var k = e && e.version != null ? String(e.version) : '';
      if (k && order.indexOf(k) === -1) order.push(k);
    });
    return { versions: order.map(function (k) { return byKey[k]; }).filter(Boolean) };
  }

  window.loadChangelogJson = function () {
    var remoteP = fetch(CHANGELOG_FETCH_URL, { cache: 'no-store' })
      .then(function (r) {
        if (!r || !r.ok) throw new Error('remote http');
        return r.json();
      })
      .then(function (data) {
        return data && Array.isArray(data.versions) ? data : { versions: [] };
      })
      .catch(function () {
        return { versions: [] };
      });

    var bundledP = (typeof window.electronApp !== 'undefined' && typeof window.electronApp.readBundledChangelog === 'function')
      ? window.electronApp.readBundledChangelog().then(function (res) {
          if (res && res.ok && res.data && Array.isArray(res.data.versions)) return res.data;
          return { versions: [] };
        }).catch(function () { return { versions: [] }; })
      : Promise.resolve({ versions: [] });

    return Promise.all([remoteP, bundledP]).then(function (arr) {
      var merged = mergeChangelogData(arr[0], arr[1]);
      if (!merged.versions.length) throw new Error('changelog empty');
      return merged;
    });
  };
})();

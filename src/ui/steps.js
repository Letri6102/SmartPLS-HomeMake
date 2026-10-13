/*
 * ui/steps.js — Thanh 3 bước ở đầu trang: mở khóa bước, đánh dấu hoàn thành, theo dõi vị trí cuộn.
 */
(function (P) {
  'use strict';
  const { $ } = P.util;
  const state = P.state;

  P.unlock = function (n) {
    for (let i = 2; i <= n; i++) {
      $('step' + i).classList.remove('locked');
      if (i === 2) $('lockHint').classList.add('hidden');
    }
    P.markSteps();
  };

  P.markSteps = function () {
    const done = { 1: state.rows.length > 0, 2: !!state.result, 3: false };
    document.querySelectorAll('#stepper a').forEach(a => a.classList.toggle('done', done[a.dataset.s]));
  };

  P.spy = function () {
    let cur = '1';
    ['1', '2', '3'].forEach(s => { const el = $('step' + s); if (el.getBoundingClientRect().top < window.innerHeight * 0.4) cur = s; });
    document.querySelectorAll('#stepper a').forEach(a => a.classList.toggle('active', a.dataset.s === cur));
  };
})(window.PTSL);

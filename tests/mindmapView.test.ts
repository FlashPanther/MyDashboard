import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fit, reveal, toWorld, zoomAt } from '../lib/mindmap/view.ts';

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

test('une petite carte est centrée sans être agrandie', () => {
  assert.deepEqual(fit([box(0, 0, 100, 40)], 1000, 600), { scale: 1, x: 450, y: 280 });
});

test('une grande carte est réduite pour tenir avec ses marges', () => {
  const view = fit([box(-1000, 0, 100, 40), box(900, 400, 100, 40)], 1000, 600, 50);
  assert.equal(view.scale, 0.45);
  assert.equal(view.x, 500);
  assert.equal(view.y, 201);
});

test('une carte immense ne descend pas sous le zoom minimal', () => {
  assert.equal(fit([box(0, 0, 100000, 40)], 1000, 600).scale, 0.2);
});

test('sans nœud, la vue reste à l’origine', () => {
  assert.deepEqual(fit([], 1000, 600), { x: 0, y: 0, scale: 1 });
});

test('le zoom garde immobile le point sous le curseur', () => {
  const view = zoomAt({ x: 100, y: 50, scale: 1 }, 2, 300, 200);
  assert.deepEqual(view, { scale: 2, x: -100, y: -100 });
});

test('le zoom reste dans ses bornes', () => {
  assert.equal(zoomAt({ x: 0, y: 0, scale: 2.5 }, 4, 0, 0).scale, 3);
  assert.equal(zoomAt({ x: 0, y: 0, scale: 0.3 }, 0.1, 0, 0).scale, 0.2);
});

test('un nœud déjà visible ne déplace pas la vue', () => {
  const view = { x: 0, y: 0, scale: 1 };
  assert.equal(reveal(view, box(200, 200, 100, 40), 1000, 600), view);
});

test('un nœud hors champ est ramené juste à l’intérieur des marges', () => {
  const view = { x: 0, y: 0, scale: 1 };
  assert.deepEqual(reveal(view, box(1200, 700, 100, 40), 1000, 600), { x: -360, y: -200, scale: 1 });
  assert.deepEqual(reveal(view, box(-300, -100, 100, 40), 1000, 600), { x: 360, y: 160, scale: 1 });
});

test('le cadrage sur un nœud tient compte du zoom', () => {
  assert.deepEqual(reveal({ x: 0, y: 0, scale: 2 }, box(600, 100, 100, 40), 1000, 600), { x: -460, y: 0, scale: 2 });
});

test('un point de l’écran se lit dans la carte en défaisant décalage et zoom', () => {
  assert.deepEqual(toWorld({ x: 100, y: 50, scale: 2 }, 300, 250), { x: 100, y: 100 });
});

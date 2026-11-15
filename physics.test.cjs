const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(`${__dirname}/jogo.html`, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script); // Verifica também a sintaxe da cena e dos controles.
const physics = script.slice(0, script.indexOf('/* ---------- cena 3D'));
const persistence = script.slice(script.indexOf('function getSave()'), script.indexOf('function doSave()'));
function game() {
  const elements = new Map();
  const storage = new Map();
  const ctx = vm.createContext({
    document: { getElementById(id) {
      if (!elements.has(id)) elements.set(id, { style: {} });
      return elements.get(id);
    } },
    navigator: {},
    localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) },
  });
  vm.runInContext(physics + persistence + ';bp=()=>{};start();', ctx);
  return code => vm.runInContext(code, ctx);
}

test('a comporta permite subir e bloqueia retornos retos e diagonais', () => {
  const run = game();
  for (const vx of [-700, 0, 700]) {
    run(`b={x:369,y:235,vx:${vx},vy:-1100};gate(369,260)`);
    assert.equal(run('b.vy'), -1100);
    run(`b={x:${369 + vx * .01},y:260,vx:${vx},vy:1500};gate(${369 - vx * .01},224)`);
    assert.equal(run('b.y'), 242);
    assert.ok(run('b.vy<0&&b.vx<0'));
  }
  run('b={x:340,y:260,vx:0,vy:500};gate(340,224)');
  assert.equal(run('b.vy'), 500, 'a comporta não ocupa a área livre da mesa');
  run('b={x:369,y:400,vx:0,vy:500};gate(369,390)');
  assert.equal(run('b.vy'), 500, 'uma tentativa que não chega à saída pode voltar à mola');
});

test('lançamentos de todas as forças saem e não voltam ao corredor', () => {
  for (const dt of [1 / 120, 1 / 60, .033]) {
    for (const power of [0, .25, .5, .75, 1]) {
      const run = game();
      run(`pw=${power};launch()`);
      let exited = false;
      for (let i = 0; i < 10 / dt; i++) {
        run(`frame(${dt})`);
        if (run('balls<3')) break;
        if (run('b.y<242')) exited = true;
        if (exited) assert.ok(run('!(b.x>358&&b.y>258)'), `retorno: força ${power}, dt ${dt}`);
        assert.ok(run('Number.isFinite(b.x+b.y+b.vx+b.vy)'));
      }
      assert.ok(exited, `lançamento preso: força ${power}, dt ${dt}`);
    }
  }
});

test('as duas rampas impulsionam para cima e para dentro', () => {
  for (const side of [-1, 1]) {
    const run = game();
    const x = side === -1 ? 83 : 295;
    run(`b={x:${x},y:504,vx:${side * 300},vy:200,hid:0};step(.001)`);
    assert.ok(run(`b.vy<0&&b.vx*${side}<0`));
    assert.equal(run('score'), 10);
  }
});

test('retornos pela boca da pista não atravessam a comporta nem a junção da parede', () => {
  const run = game();
  for (const x of [342, 349, 351, 358, 369, 372]) {
    for (const vx of [-900, -300, 0, 300, 900]) {
      for (const vy of [200, 800, 1400]) {
        run(`newBall();b.x=${x};b.y=230;b.vx=${vx};b.vy=${vy}`);
        for (let i = 0; i < 20; i++) {
          run('frame(.033)');
          assert.ok(run('!(b.x>358&&b.y>258)'), `retorno em x=${x}, vx=${vx}, vy=${vy}`);
        }
      }
    }
  }
});

test('satélite se move, pausa congela e colisão pontua apenas na aproximação', () => {
  const run = game();
  run('frame(.033)');
  assert.ok(run('BU[3].x>190'));
  const x = run('BU[3].x');
  run('paused=true;frame(.033)');
  assert.equal(run('BU[3].x'), x);
  run('paused=false;resetObstacles();b={x:190,y:384.5,vx:0,vy:200,hid:0};step(.001)');
  assert.equal(run('score'), 200);
  assert.ok(run('b.vy<0'));
  run('step(.001)');
  assert.equal(run('score'), 200);
  run('b={x:140,y:210,vx:0,vy:-G*.001,hid:0};step(.001)');
  assert.ok(run('Number.isFinite(b.x+b.y+b.vx+b.vy)'), 'centros coincidentes não geram NaN');
  run('score=0;BU[0].cool=0;b={x:140,y:179,vx:0,vy:-200,hid:0};step(.001)');
  assert.equal(run('score'), 0, 'afastar-se não dispara outro prêmio');
});

test('salvar mantém a fase do satélite e aceita partidas antigas', () => {
  const run = game();
  run('frame(.033);save()');
  const x = run('BU[3].x');
  run('frame(.033);load()');
  assert.equal(run('BU[3].x'), x);
  assert.equal(run("$('bPa').textContent"), '⏸ Pausar');
  run("const old=getSave();delete old.tableTime;localStorage.setItem('cosmicCadet:v1',JSON.stringify(old));load()");
  assert.equal(run('tableTime'), 0);
  assert.ok(run('Number.isFinite(BU[3].x)'));
});

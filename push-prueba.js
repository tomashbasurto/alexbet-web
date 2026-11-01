// AlexBet · manda una notificación de prueba a los celulares Premium registrados (o solo a un correo con PARA=correo).
'use strict';
(async () => {
  const P = await require('./push-send').init(); if (!P) { console.log('sin acceso a Firebase'); process.exit(1); }
  let para = (process.env.PARA || '').trim().toLowerCase(); if (para === 'todos') para = '';
  if (para) P.users.forEach(u => { if ((u.email || '').toLowerCase() !== para) u.dead = true; });
  console.log('destinatarios:', P.users.filter(u => !u.dead).map(u => u.email || '(sin correo)').join(', ') || 'ninguno', '· registrados:', P.users.map(u => u.email || '(sin correo)').join(', '));
  for (const u of P.users) if (!u.dead) u.tipos = u.tipos.concat('prueba');
  await P.notify('prueba', 'AlexBet · prueba', 'Las notificaciones funcionan en este celular ✅', {tag: 'prueba'});
  console.log(JSON.stringify(P.stats()));
})();

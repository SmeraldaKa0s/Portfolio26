---
title: "Una evidencia, muchos retailers"
category: "Logistics"
excerpt: "Seis aplicativos conectados · Sistema configurable de evidencia de entrega para los principales clientes del ecosistema Pickit."
order: 3
media:
  kind: image
  ratio: "8 / 5"
---

## El problema

Pickit pedía la misma evidencia de entrega para todos sus clientes: nombre, apellido, DNI, foto y firma, obligatorios siempre. Cuando empezaron a pedir configuraciones distintas, el producto no podía darlas. Y en paralelo, cuando llegaba un reclamo —"mi paquete dice entregado pero no lo recibí"—, atención al cliente tenía que reconstruir la evidencia a mano, cruzando archivos de distintos lugares para contestar. Podía tardar días.

El mismo problema se rompía por tres lados al mismo tiempo: no se podía configurar, no se podía trazar, y lo que faltaba de trazabilidad lo compensaban las personas.

Rol: UX Analyst · Cliente: Mercado Pago AR/MX, Getnet · Plataforma: Pickit (6 aplicativos conectados) · Fecha: 2026

## Métricas proyectadas

![Projected metrics for configurable proof of delivery project](/images/projects/projected_metrics-POD.svg)


## Cómo lo abordé

Arranqué reactivando un research del equipo de UX del 2023 que ya existía —nueve entrevistas a usuarios internos— y que venía recomendando centralizar la evidencia en el detalle de la transacción. Estaba archivado hace dos años. La oportunidad fue esta.

Trabajé con desarrollo desde el mapeo inicial, no en handoff. Eso permitió que decisiones estructurales (como unificar las dos tablas que guardaban datos del mismo evento) salieran del equipo técnico, no como imposición de diseño. Usé Pickit Components, el design system interno, para todos los aplicativos —me apoyé en patrones existentes y sumé dos componentes nuevos al sistema.

Validé el flujo en calle haciendo de rider yo misma. El flujo de evidencia funcionó bien. Apareció fricción en otra parte del flujo que quedó documentada para un próximo release.

## Decisiones de diseño

**App del rider.** El rider no sabe qué evidencia le van a pedir hasta que escanea el paquete. Mostrarle todos los campos posibles de una lo satura en un contexto donde suele tener una mano ocupada. Rompí el flujo en tres momentos:

1. Llegada al domicilio: ve datos fijos del paquete y dos botones, "escanear paquete" o "no pude entregarlo".
2. Escaneo: abre un formulario que muestra solo los campos que ese cliente configuró.
3. Firma y foto en pantallas propias, porque son gestos físicos completos —el teléfono cambia de manos para firmar, se rota para encuadrar la foto.

**Contribución al design system:** los componentes de *firma registrada* y *foto registrada*. Bloques visuales que le devuelven al rider la confirmación de que su trabajo quedó guardado antes de pasar a la siguiente pantalla. Ese patrón no existía y quedó disponible para futuros flujos con evidencia visual.

**Panel de administración.** El modelo anterior era "una transacción, una foto". El nuevo: "una transacción, N evidencias". Reemplacé el botón "ver foto" por miniaturas clickeables. La sección "evidencia de entrega" está siempre presente, aunque no haya datos —en ese caso dice "no disponible". Previsibilidad antes que economía de espacio: atención al cliente necesita encontrar siempre en el mismo lugar.

**Web de comercio y web de puntos.** La evidencia vive dentro del tracking existente, no en un menú nuevo. Duplicar flujos mentales era regalar fricción.

## Qué dejé afuera del R1 y por qué

- **Notificación automática al comprador con la evidencia.** Alto valor percibido, pero dependía de coordinar copy con marketing en seis mercados y de un canal de notificación que todavía no existía. Se podía diseñar, no se podía lanzar.
- **Reglas de validación cruzada entre configuraciones** (ejemplo: bloquear DNI sin nombre). Fácil de construir, imposible de justificar sin ver cómo los clientes usaban la configuración libre. Primero observar, después restringir.

## Lo que me llevo

Atención al cliente tenía la información distribuida en carpetas del escritorio, un drive compartido con el operador logístico, un servidor externo y conversaciones de chat. Centralizar esa información en el detalle de la transacción no fue un cambio de UI, fue un cambio de modelo mental —pasar de "buscar evidencia" a "consultar evidencia".

El otro aprendizaje vino de testear la feature haciendo de rider yo misma. Lo que diseñé funcionaba. Lo valioso fue encontrar fricción en otra parte del flujo que ni siquiera era mi scope. Una feature nunca se testea sola: se testea el sistema.

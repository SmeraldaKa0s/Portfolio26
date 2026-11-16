---
title: "¿Qué se rompe cuando un same-day escala?"
category: "Logistics"
excerpt: "Rediseño del servicio de same day para habilitar pedidos multi-bulto para Mercado Pago."
order: 2
media:
  kind: image
  ratio: "8 / 5"
---

## El problema

Pickit no podía operar transacciones Same-day con más de un bulto. La limitación bloqueaba cinco procesos: etiquetado, despacho, entrega, devolución e ingreso de ítems.

Para Mercado Pago, esto significaba que una vertical entera de sellers con catálogo de points no podía usar Same-day. El servicio estaba diseñado para transacciones de 1 ítem = 1 bulto = 1 serial, y ese supuesto se rompía apenas una transacción tenía varios ítems de un mismo SKU. Era la última pieza del servicio Same-day que faltaba habilitar.

**Fricción concreta en los aplicativos:**

- La Web Puntos congelaba la pantalla al despachar pedidos multi-bulto.
- Se imprimía una sola etiqueta por transacción, aunque hubiera varios bultos físicos. El layout no tenía cómo mostrar "bulto 1 de 3".
- La app de pickers no sabía cómo colectar ni entregar varios bultos asociados al mismo serial de transacción.

![Matriz de actores por aplicativos afectados](/images/projects/mapa_actores_aplicativos_pod.svg)

Esta es la matriz que armamos. Muestra cómo cada perfil interactúa con cada aplicativo del ecosistema Pickit, y deja en claro dónde se concentró el trabajo de diseño.

Rol: Product Designer / PM · Cliente: Mercado Pago · Plataforma: Pickit (ecosistema de logística de última milla) · Fecha: 2026

## Métricas proyectadas (MVP)

![Projected metrics for multi-package Same-day initiative](/images/projects/projected_metrics_multibulto_v2.svg)

## Cómo lo abordé

Mapeé el flujo completo antes de tocar nada. Documenté imposición → etiquetado → despacho → colecta → entrega → devolución, marcando cada punto donde el sistema asumía que una transacción equivalía a un bulto. Separé lo que era lógica de backend (validaciones de imposición) de lo que era experiencia en los aplicativos.

**Acoté el alcance con reglas duras.** Con Comercial y Desarrollo cerramos tres restricciones para el R1:

1. 1 SKU por transacción
2. Todos los ítems serializados, categoría points
3. Máximo 10 ítems

Además, R1 no habilita entrega parcial. Todo o nada. Si la entrega no se completa, es un Imposible de Entrega que pasa a Atención Operativa y se reprograma. Esta decisión simplificó mucho el diseño porque eliminó los flujos de "qué pasa si el picker solo lleva 2 de 3 bultos". Ese problema queda para un R2.

**Trabajé los criterios de aceptación con desarrollo.** Cada regla quedó trazable con su endpoint y microservicio correspondiente, lo que permitió que QA y dev trabajen en paralelo y que el handoff no dependiera de reuniones de aclaración.

**Ideación con cuatro perfiles de usuario más el equipo de desarrollo de Pickit:** Seller, Operador de Punto, Picker, Colaborador Interno de CX, y los programadores que iban a implementar los cambios. Meter a developers en la etapa de ideación fue clave: varias soluciones que parecían limpias desde UX tenían costos técnicos altos, y otras que parecían complicadas eran triviales de implementar. De esa instancia salió, por ejemplo, tratar a las transacciones multi-bulto como transacciones PRO para reusar el flujo de priorización del ruteador en vez de construir uno nuevo.

## Diseño de app

### Pickers app

La decisión de base fue tratar a las transacciones multi-bulto como transacciones PRO, para entrar en el flujo de priorización existente del algoritmo de ruteo. Sobre eso, adapté la interfaz para que el mismo picker pueda colectar y entregar varios bultos asociados a un solo serial.

**Cambios puntuales:**

- **Nueva variante del componente Tag en el design system.** Incorporé al sistema una variante promocional del Tag, pensada para distinguir transacciones de tratamiento preferente dentro del listado de viajes. A diferencia de los tags funcionales (estado, categoría), este opera sobre la percepción del picker y compite por su atención en la lista. El trabajo incluyó un ícono nuevo que aporta refuerzo visual al label y un token de color incorporado a la paleta, que sostiene la jerarquía sin pisar las convenciones ya ocupadas por success, warning, info y danger. Tag, ícono y color funcionan como un sistema coordinado: cada uno cubre un nivel distinto de lectura (forma, figura, color) y su valor aparece en el conjunto, no en cada pieza por separado.
- **Información mínima visible al ofrecer el viaje:** cantidad de paradas y cantidad total de bultos.
- **Pantalla de colecta** que muestra el total de bultos a retirar del punto contra lo que efectivamente carga el picker.
- **Pantalla de entrega** que obliga a completar los N bultos. Sin entrega parcial, sin excepciones en R1.

### Web Puntos

Rediseñé dos momentos críticos:

- **Etiqueta.** Agregué un contador "bulto X de Y" visible en cada impresión. Cambio chico de layout, impacto directo en la operación: el operador deja de depender de la pantalla para saber si imprimió todo, la información vive en el papel que tiene en la mano.
- **Flujo de despacho.** El botón de confirmar queda deshabilitado hasta que el operador escanea los seriales completos de la transacción. Esto resuelve la pantalla congelada del problema original y previene despachos incompletos que después se convertirían en tickets de CX.

## Qué dejé afuera del R1

- **Entrega parcial.** Abre una cadena de decisiones (qué se factura, qué vuelve, cómo se reprograma lo faltante) que no podíamos resolver a tiempo para este release.
- **Ítems no serializados.** R1 exige serialización completa para trackear cada bulto. Soportar ítems sin serial duplica las validaciones.
- **Más de 1 SKU por transacción.** Simplifica el ruteo, el etiquetado y la conciliación con Mercado Pago.
- **Restricciones volumétricas en el ruteador para estos viajes.** Como cada viaje multi-bulto lleva una sola transacción a un solo destino, no necesitamos recalcular volumen.

## Lo que me llevo

Entré queriendo diseñar una plataforma genérica. Salí convencido de que las restricciones, bien negociadas, son una herramienta de diseño. Si hubiera insistido en soportar entrega parcial, múltiples SKUs o ítems no serializados desde la v1, probablemente seguiríamos en discovery. La versión acotada sale, se mide contra el SLA, y recién ahí decidimos qué sumar al R2.

La otra cosa: el caso real del diseño fue la interfaz de pickers, no el proceso. Un operador en la calle, con el teléfono en una mano y una caja en la otra, no necesita más información, necesita menos fricción. Todo el rediseño de colecta y entrega se pensó desde ahí.
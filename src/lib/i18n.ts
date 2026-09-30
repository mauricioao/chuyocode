/**
 * i18n — shared locale support for ChuyoCode (spec 5: Internationalization).
 *
 * Single source of truth for the supported languages, the default language,
 * and the resolver that picks a best match from an `Accept-Language` header.
 * The middleware (lang-segment validation, root redirect) and every localized
 * page/component consume these helpers instead of hand-rolling their own maps.
 *
 * This module supersedes the tiny inline NAV_LABELS/FOOTER_LABELS maps that
 * Header/Footer used to stay autonomous in the design-system work unit (PR 2).
 */

/** Languages the site serves. `es` is primary; `en` is the secondary locale. */
export const SUPPORTED_LANGS = ['es', 'en'] as const;

/** Union of the supported language codes. */
export type Lang = (typeof SUPPORTED_LANGS)[number];

/**
 * Default language. Requests to `/` redirect here and any unresolved locale
 * falls back to this value (spec 5: root redirect + es fallback).
 */
export const DEFAULT_LANG: Lang = 'es';

/**
 * Type guard: is `lang` one of the supported languages?
 *
 * Accepts an `unknown` so it can validate raw route params / header fragments
 * without an unsafe cast at the call site.
 */
export function isValidLang(lang: unknown): lang is Lang {
  return (
    typeof lang === 'string' &&
    (SUPPORTED_LANGS as readonly string[]).includes(lang)
  );
}

/** The default language. Kept as a function for call-site symmetry with resolve. */
export function getDefaultLang(): Lang {
  return DEFAULT_LANG;
}

/**
 * Resolve the best-matching supported language from an `Accept-Language`
 * header value.
 *
 * Parses the header's quality-weighted list (e.g. `en-US,en;q=0.9,es;q=0.8`),
 * sorts by `q`, and returns the first entry whose primary subtag is supported.
 * Falls back to {@link DEFAULT_LANG} when the header is absent, empty, or names
 * no supported language.
 *
 * @param acceptLang - Raw `Accept-Language` header value, if any.
 */
export function resolveLang(acceptLang?: string | null): Lang {
  if (!acceptLang) {
    return DEFAULT_LANG;
  }

  const ranked = acceptLang
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params
        .map((p) => p.trim())
        .find((p) => p.startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
      // Primary subtag only: `en-US` -> `en`.
      const primary = tag.trim().toLowerCase().split('-')[0];
      return { primary, q: Number.isNaN(q) ? 0 : q };
    })
    .filter((entry) => entry.primary.length > 0)
    .sort((a, b) => b.q - a.q);

  for (const entry of ranked) {
    if (isValidLang(entry.primary)) {
      return entry.primary;
    }
  }

  return DEFAULT_LANG;
}

/**
 * Localized labels for shared chrome (Header nav, Footer secondary links).
 *
 * Centralized here so Header/Footer no longer carry their own inline maps.
 * Keep these keys stable — components read `UI_LABELS[lang]` directly.
 */
export const UI_LABELS = {
  es: {
    meta: {
      // A `<meta name="description">` DESCRIBES; it does not instruct. The
      // sentence that used to open with an imperative is now a claim about the
      // catalogue the previous sentence just named — same promise, no verb
      // addressing the reader. `aprender` was already carried by "cursos".
      siteDescription:
        'ChuyoCode: libros, artículos y cursos de programación para la comunidad latina. Tecnología en tu idioma, con fundamentos sólidos.',
      booksDescription:
        'Catálogo de libros de programación y tecnología en español, seleccionados para aprender con fundamentos sólidos.',
      newsDescription:
        'Últimas noticias y artículos de programación y tecnología para la comunidad latina de desarrolladores.',
    },
    nav: {
      home: 'Inicio',
      books: 'Libros',
      news: 'Noticias',
      courses: 'Cursos',
      englishLink: 'Inglés',
      english: 'English',
      soon: 'Pronto',
      switchTo: 'Cambiar a',
    },
    footer: { terms: 'Términos y Condiciones', privacy: 'Privacidad' },
    // Chrome shared by any page that mounts it (`BackButton`, `ScrollToTop`) —
    // not tied to one section, unlike `english`/`activities`/`legal` below.
    common: {
      back: 'Volver',
      backTooltip: 'Volver a la página anterior',
      scrollToTop: 'Volver arriba',
    },
    legal: {
      titles: { terms: 'Términos y condiciones', privacy: 'Política de privacidad' },
      pending: 'Contenido legal pendiente',
      privacyNote:
        'Respetamos tu privacidad. Todavía estamos redactando la versión completa de este documento; mientras tanto, no vendemos ni compartimos tus datos personales con terceros.',
    },
    news: { readMore: 'Leer más' },
    article: { back: 'Volver a noticias' },
    // Sign-in page (`/[lang]/auth/entrar.astro`, slice 4). The form's own
    // dynamic states (idle/pending/sent/error) are local to `SignInForm.COPY`,
    // same reasoning as `LikeButton.COPY` — they depend on request state the
    // page cannot see. This block covers only the page's static chrome.
    auth: {
      title: 'Entrar',
      description:
        'Entrar con correo y contraseña, con Google o con un enlace de acceso.',
      linkInvalid:
        'Ese enlace no es válido o ya venció. Solicitar uno nuevo con el formulario de abajo.',
      signedIn: 'Sesión iniciada.',
      alreadySignedIn: 'Ya hay una sesión iniciada en este navegador.',
      signOut: 'Salir',
      // Server-rendered page chrome only (no client state): the Google
      // button is a plain `<form>` with no island, and the divider sits
      // between it and the password island. Everything that depends on
      // CLIENT state (sign-in/sign-up mode, pending/error/success) is LOCAL
      // to `PasswordAuthForm.COPY` / `AuthPanel.COPY`, same rule as
      // `SignInForm.COPY` — see that island's header.
      google: 'Continuar con Google',
      googleUnavailable:
        'El acceso con Google no está disponible en este momento. Probar con correo y contraseña.',
      orDivider: 'o',
      nuevaClave: {
        title: 'Nueva contraseña',
        description: 'Elegir una nueva contraseña para la cuenta.',
      },
      // Copy for `UserMenu` (Login step 1b), the header's client-only
      // identity chip. Local to no island's own COPY map — see that
      // component's header for why this slice keeps it here instead.
      userMenu: {
        signIn: 'Ingresar',
        signUp: 'Crear cuenta',
        accountMenu: 'Cuenta',
        planFree: 'Free',
        planPremium: 'Premium',
        // Links to the activities creator start screen (`/[lang]/crear`,
        // PR B). Local here, not to `activities.*`, for the same reason as
        // the rest of this map: it is chrome for the header's identity
        // chip, not copy owned by the creator pages themselves.
        createActivity: 'Crear actividad',
        // Links to the author's own workspace (`/[lang]/mis-actividades`, PR
        // D "Activities practice"). Same placement/chrome rule as
        // `createActivity` right above it.
        myActivities: 'Mis actividades',
        // Links to the moderator queue (`/[lang]/admin/actividades`, PR E
        // "Moderation"), shown only for `profile.isModerator`. Same
        // placement/chrome rule as `createActivity`/`myActivities`.
        moderation: 'Moderación',
        signOut: 'Cerrar sesión',
      },
    },
    // Authoring pages (`/[lang]/crear/*`, slice 15). UNLINKED routes — no nav
    // entry anywhere (slice 18). Static page chrome only; the interactive
    // block editors keep their own LOCAL copy, same rule as `ExerciseIsland`.
    authoring: {
      newTitle: 'Crear ejercicio',
      newDescription: 'Crear un nuevo ejercicio de inglés.',
      editTitle: 'Editar ejercicio',
      editDescription: 'Editar este ejercicio.',
    },
    // Activities creator (`/[lang]/crear`, `/[lang]/crear/[id]`, PR B "Activities
    // creator"). `untitledTitle` is the server-computed default for a
    // brand-new activity — the start screen never asks for a title up front.
    activities: {
      untitledTitle: 'Sin título',
      start: {
        pageTitle: 'Crear actividad',
        pageDescription: 'Elegir el tipo de contenido para una nueva actividad.',
        heading: 'Elegir el punto de partida',
        worksheet: {
          title: 'Hoja de trabajo',
          description: 'Subir una hoja de trabajo o un PDF y agregar respuestas encima.',
        },
        questions: {
          title: 'Preguntas',
          description: 'Preguntas de opción múltiple y otros ejercicios interactivos.',
        },
        creating: 'Creando la actividad…',
        createError: 'No se pudo crear la actividad. Intentar de nuevo.',
      },
      editor: {
        pageTitle: 'Editar actividad',
        pageDescription: 'Editar el contenido de esta actividad.',
        titleLabel: 'Título',
        levelLabel: 'Nivel',
        levelNone: 'Sin nivel',
        previewOn: 'Vista previa',
        previewOff: 'Volver a editar',
        save: 'Guardar',
        saving: 'Guardando…',
        saved: 'Cambios guardados',
        unsaved: 'Cambios sin guardar',
        saveError: 'No se pudo guardar. Intentar de nuevo.',
        saveRetry: 'Reintentar',
        unloadWarning: 'Hay cambios sin guardar. Van a perderse si se cierra la página.',
        blocksEmpty: 'Todavía no hay bloques. Agregar el primero para empezar.',
        addBlock: 'Agregar bloque',
        moveUp: 'Subir bloque',
        moveDown: 'Bajar bloque',
        dragHandle: 'Reordenar',
        deleteBlock: 'Eliminar bloque',
        deleteConfirmTitle: '¿Eliminar este bloque?',
        deleteConfirmBody: 'Esta acción no se puede deshacer.',
        deleteConfirmCancel: 'Cancelar',
        deleteConfirmAccept: 'Eliminar',
        worksheetLabel: 'Hoja de trabajo',
        quizLabel: 'Preguntas',
        // Creator polish round 2.
        blockNameLabel: 'Nombre del bloque',
        blockNamePlaceholder: 'Nombre del bloque',
        blockDefaultNamePrefix: 'Hoja',
        collapseBlock: 'Colapsar bloque',
        expandBlock: 'Expandir bloque',
        collapseAll: 'Colapsar todos',
        expandAll: 'Expandir todos',
        zoneCountOne: 'zona',
        zoneCountMany: 'zonas',
        questionCountOne: 'pregunta',
        questionCountMany: 'preguntas',
        rotateLeft: 'Girar a la izquierda',
        rotateRight: 'Girar a la derecha',
        blockIndex: 'Ir a un bloque',
        blockIndexTitle: 'Bloques',
        undo: 'Deshacer',
        redo: 'Rehacer',
        shortcutsHelp: 'Atajos de teclado',
        shortcutsTitle: 'Atajos de teclado',
        shortcutsClose: 'Cerrar',
        shortcutUndo: 'Deshacer',
        shortcutRedo: 'Rehacer',
        shortcutSave: 'Guardar',
        shortcutEscape: 'Deseleccionar',
        shortcutZoomIn: 'Acercar',
        shortcutZoomOut: 'Alejar',
        // Keyboard zone creation (accessibility): Enter/N with the Zona
        // tool active and the canvas focused.
        shortcutNewZone: 'Nueva zona',
        // Floating side toolbar pass: the drag handle, and the ghost "dock"
        // target shown while undocked.
        moveToolbar: 'Mover barra',
        dockToolbar: 'Volver a su lugar',
        savingStatus: 'Guardando cambios',
        savedStatus: 'Cambios guardados',
        errorStatus: 'No se pudo guardar',
        // Icon-only retry button (creator polish round 3, owner feedback #1):
        // the ONE accessible label/tooltip for the button itself, replacing
        // the separate status-icon + "Reintentar" text pair.
        saveErrorRetry: 'No se pudo guardar, reintentar',
        // Inline messages next to the exact block/zone `enviar.ts` points
        // back to on a rejected submit (creator polish round 3, `t.submitErrors`'s
        // sibling, keyed by `findIncompleteBlock`'s own reason codes).
        incompleteNoZones: 'Esta hoja de trabajo necesita al menos una zona de respuesta.',
        incompleteNoAnswers: 'Esta zona todavía no tiene una respuesta.',
        incompleteTooFewOptions: 'Esta zona de opción múltiple necesita al menos dos opciones.',
        incompleteAnswerNotInOptions: 'La respuesta marcada debe estar entre las opciones.',
        incompleteQuizNoSlots: 'Este bloque de preguntas necesita al menos una pregunta.',
        incompleteQuizNoAnswer: 'Esta pregunta todavía no tiene una respuesta.',
        incompleteQuizTooFewOptions: 'Esta pregunta necesita al menos dos opciones.',
        incompleteQuizAnswerNotInPool: 'La respuesta marcada debe estar entre las opciones.',
        unsavedModalTitle: 'El ejercicio tiene cambios sin guardar',
        unsavedModalSaveAndLeave: 'Guardar y salir',
        unsavedModalLeaveWithoutSaving: 'Salir sin guardar',
        unsavedModalCancel: 'Cancelar',
        // Review-state badge (PR D, "Activities practice") — mirrors
        // `activities.status` exactly (draft/pending_review/live/rejected);
        // `removed` never reaches the editor (excluded from the author's own
        // edit surface, `getActivityForEdit`'s header).
        statusDraft: 'Borrador',
        statusPendingReview: 'En revisión',
        statusLive: 'Publicada',
        statusRejected: 'Rechazada',
        reviewNoteLabel: 'Nota del revisor',
        // Submit-for-review dialog.
        submitForReview: 'Enviar a revisión',
        submitDialogTitle: 'Enviar esta actividad a revisión',
        submitDialogNote: 'La actividad va a ser revisada por un moderador antes de publicarse.',
        submitRightsLabel: 'Confirmo que tengo el derecho de usar este material.',
        submitConfirm: 'Enviar',
        submitCancel: 'Cancelar',
        submitting: 'Enviando…',
        // Keyed by the endpoint's own reason codes (`enviar.ts`'s header).
        submitErrors: {
          rights_required: 'Hace falta confirmar el derecho de uso del material.',
          invalid_title: 'Poner un título antes de enviar la actividad.',
          no_blocks: 'Agregar al menos un bloque antes de enviar la actividad.',
          missing_zones: 'Cada hoja de trabajo necesita al menos una zona de respuesta.',
          invalid_blocks: 'El contenido de la actividad no es válido.',
          no_draft: 'No hay cambios nuevos para enviar a revisión.',
          submit_failed: 'No se pudo enviar la actividad. Intentar de nuevo.',
        },
      },
      worksheet: {
        uploadTitle: 'Subir una imagen o un PDF',
        uploadHint: 'Arrastrar un archivo hasta aquí, o elegirlo desde el dispositivo.',
        uploadButton: 'Elegir archivo',
        uploadDragActive: 'Soltar el archivo aquí',
        uploadProgress: 'Subiendo…',
        pdfPagesTitle: 'Elegir páginas del PDF',
        pdfPagesHint: 'Hasta 10 páginas. Cada página elegida se agrega como un bloque propio.',
        pdfPageLabel: 'Página',
        pdfConfirm: 'Agregar páginas',
        // PDF page thumbnails (replaces the blind page-number field as the
        // FIRST option — the text field above stays as a fallback, both when
        // rendering thumbnails fails and as a manual "type a page number"
        // escape hatch, e.g. past the 40-page thumbnail cap).
        pdfThumbnailsLoading: 'Generando miniaturas…',
        pdfThumbnailsHint: 'Elegir hasta 10 páginas para agregar como bloques.',
        pdfSelectAll: 'Seleccionar todas',
        pdfSelectedCountLabel: 'seleccionadas',
        pdfAddPagesPrefix: 'Agregar',
        pdfPageCountOne: 'página',
        pdfPageCountMany: 'páginas',
        pdfThumbnailsTruncated:
          'Este PDF tiene más de 40 páginas: se muestran las primeras 40. Para elegir otra página, usar el número de página.',
        pdfThumbnailsSwitchToText: 'Elegir por número de página',
        errors: {
          unsupported_media_type: 'Ese tipo de archivo no está admitido.',
          empty_body: 'El archivo está vacío.',
          payload_too_large: 'El archivo es demasiado grande.',
          not_webp: 'La imagen no pudo procesarse.',
          invalid_dimensions: 'La imagen debe medir entre 200 y 2400 píxeles de lado.',
          upload_limit_reached: 'Se alcanzó el límite de archivos subidos.',
          upload_failed: 'No se pudo subir el archivo. Intentar de nuevo.',
          pdf_failed: 'No se pudo procesar el PDF.',
        },
        addZoneHint: 'Dibujar un recuadro sobre la imagen para agregar una respuesta.',
        zoneKindText: 'Texto',
        zoneKindChoice: 'Opción',
        zoneKindLabel: 'Tipo de respuesta',
        zoneAnswersLabel: 'Respuestas aceptadas',
        zoneAnswerPlaceholder: 'Respuesta',
        zoneAnswerAdd: 'Agregar respuesta',
        zoneAnswerRemove: 'Quitar respuesta',
        zoneOptionsLabel: 'Opciones',
        zoneOptionPlaceholder: 'Opción',
        zoneOptionAdd: 'Agregar opción',
        zoneOptionRemove: 'Quitar opción',
        zoneOptionCorrect: 'Correcta',
        // "Escuchar/Listen" affordance (D4): an optional author field per
        // zone, since a worksheet is an uploaded image with no
        // machine-readable text otherwise.
        zoneSpeakLabel: 'Texto para escuchar',
        zoneSpeakPlaceholder: 'Texto que se va a leer en voz alta',
        zoneDelete: 'Eliminar zona',
        zoneMinOptions: 'Se necesitan al menos 2 opciones.',
        zoneAnswerNotInOptions: 'Cada respuesta debe estar entre las opciones.',
        noZonesYet: 'Todavía no hay zonas dibujadas sobre esta imagen.',
        panelEmpty: 'Dibujar un recuadro sobre la hoja o seleccionar uno para editarlo.',
        panelEmptyHint:
          'Atajos: V para la herramienta Zona, H para Mano, Enter o N para crear una zona centrada en lo visible, flechas para mover una zona seleccionada, Suprimir para eliminarla, rueda o los botones de abajo para hacer zoom.',
        zoomOut: 'Alejar',
        zoomIn: 'Acercar',
        zoomFit: 'Ajustar',
        zoomReset: '100%',
        zoomLevel: 'Nivel de zoom',
        zoomInputLabel: 'Porcentaje de zoom',
        toolZone: 'Zona',
        toolZoneTooltip: 'Zona (V)',
        toolHand: 'Mano',
        toolHandTooltip: 'Mano (H)',
        // Keyboard zone creation (accessibility): Enter/N with the Zona
        // tool active and the canvas focused — announced via an aria-live
        // region, see `WorksheetZoneEditor.tsx`'s own header.
        zoneCreatedAnnouncement: 'Zona creada',
      },
      player: {
        notGraded: 'Vista previa: esta vista no corrige respuestas.',
        textPlaceholder: 'Escribir la respuesta',
        choicePlaceholder: 'Elegir una opción',
        // Per-zone grading feedback (PR D "Activities practice" — the
        // practice player passes `practice.results`; the creator preview
        // never does, so these two never render there).
        correct: 'Correcto',
        incorrect: 'Incorrecto',
        // A quiz question's mechanic has no shipped renderer yet (PR C,
        // "Preguntas (quiz) block") — same wording as `ExerciseIsland`'s own
        // local `unavailable` copy, kept in sync deliberately.
        quizUnavailable: 'Esta parte del ejercicio todavía no se puede resolver aquí.',
        // The mobile per-zone bottom sheet (mobile layout pass) — a phone
        // taps a zone instead of typing inline; desktop never shows these.
        // `zoneOf` is composed at the call site as `${zoneOf} 2/5`, same
        // convention as `practice.score`'s own `${t.score}: 3 / 5`.
        zoneSheetTitle: 'Responder',
        zoneEmpty: 'Sin responder',
        zonePrev: 'Anterior',
        zoneNext: 'Siguiente',
        zoneDone: 'Listo',
        zoneOf: 'Zona',
      },
      // Practice page (`/[lang]/ingles/actividades/[id]`, PR D "Activities
      // practice"). `WorksheetPlayer`'s own `player.*` copy above covers the
      // per-zone inputs; this block is the page's chrome around it.
      practice: {
        pageDescription: 'Practicar esta actividad de inglés: hojas de trabajo y preguntas con corrección al instante.',
        back: 'Volver a actividades',
        noLevel: 'Sin nivel',
        check: 'Comprobar',
        retry: 'Reintentar',
        score: 'Puntaje',
        viewedFirstTime: 'Primera vez',
        viewedBefore: 'Ya lo viste',
        viewedTimesMany: 'veces',
        // "Corazón" toggle (Descubrir/discovery). Two names, one per
        // direction — same reasoning as `LikeButton`'s own `COPY`: the
        // action the press performs, not the current state (`aria-pressed`
        // already carries that).
        heartAdd: 'Dar corazón',
        heartRemove: 'Quitar corazón',
        heartsOne: 'corazón',
        heartsMany: 'corazones',
      },
      // "Reportar" button + dialog on the practice page (PR E, "Moderation").
      // Hidden for the activity's own author and for anonymous visitors —
      // `POST /api/actividades/[id]/reportar` refuses both server-side too
      // (`recordReport`'s own header).
      report: {
        button: 'Reportar',
        dialogTitle: 'Reportar esta actividad',
        reasonLabel: 'Motivo',
        reasons: {
          inappropriate: 'Contenido inapropiado',
          off_topic: 'Fuera de tema',
          copyright: 'Derechos de autor',
          wrong_answers: 'Respuestas incorrectas',
          other: 'Otro',
        },
        detailsLabel: 'Detalles (opcional)',
        detailsPlaceholder: 'Agregar más información…',
        cancel: 'Cancelar',
        submit: 'Enviar reporte',
        submitting: 'Enviando…',
        success: 'Gracias, lo vamos a revisar.',
        close: 'Cerrar',
        // Keyed by the endpoint's own reason codes (`reportar.ts`'s header).
        errors: {
          self_report: 'No se puede reportar la propia actividad.',
          invalid_reason: 'Elegir un motivo antes de enviar el reporte.',
          invalid_details: 'Los detalles son demasiado largos.',
          report_failed: 'No se pudo enviar el reporte. Intentar de nuevo.',
        },
      },
      // Author's own workspace (`/[lang]/mis-actividades`, PR D "Activities
      // practice"). Status badges reuse `editor.status*` rather than
      // duplicating them — same status vocabulary, same screen family.
      myActivities: {
        pageTitle: 'Mis actividades',
        pageDescription: 'Las actividades creadas: editar, ver o eliminar cada una.',
        empty: 'Todavía no se creó ninguna actividad.',
        createCta: 'Crear actividad',
        noLevel: 'Sin nivel',
        blockCountOne: 'bloque',
        blockCountMany: 'bloques',
        pendingChangesNote: 'Cambios en revisión',
        edit: 'Editar',
        view: 'Ver',
        delete: 'Eliminar',
        deleteConfirmTitle: '¿Eliminar esta actividad?',
        deleteConfirmBody: 'Esta acción no se puede deshacer.',
        deleteConfirmCancel: 'Cancelar',
        deleteConfirmAccept: 'Eliminar',
        deleteError: 'No se pudo eliminar la actividad. Intentar de nuevo.',
      },
      // Public feed (`/[lang]/ingles/actividades`, PR D "Activities
      // practice") — live activities only, newest published first. Under
      // `ingles/**`, so `@lib/access`'s section gate and the middleware's
      // own `markPrivate` already cover it; nothing extra is needed here.
      explore: {
        pageTitle: 'Actividades de la comunidad',
        pageDescription:
          'Actividades creadas por otros usuarios de ChuyoCode: hojas de trabajo y preguntas para practicar.',
        heading: 'Actividades de la comunidad',
        cardTitle: 'Actividades de la comunidad',
        cardDescription: 'Practicar con hojas de trabajo y preguntas creadas por otros usuarios.',
        empty: 'Todavía no hay actividades publicadas.',
        emptyFiltered: 'No hay actividades que coincidan con estos filtros.',
        clearFilters: 'Limpiar filtros',
        allLevels: 'Todos los niveles',
        noLevel: 'Sin nivel',
        blockCountOne: 'bloque',
        blockCountMany: 'bloques',
        pagination: 'Paginación',
        prevPage: 'Anterior',
        nextPage: 'Siguiente',
        pageLabel: 'Página',
        ofLabel: 'de',
        // Filters bar (Descubrir/discovery): search + level + type + sort +
        // "no las he visto", one GET form so the whole thing works without
        // JavaScript (`[lang]/ingles/actividades/index.astro`'s own header).
        searchLabel: 'Buscar actividades',
        searchPlaceholder: 'Buscar por título…',
        levelLabel: 'Nivel',
        typeLabel: 'Tipo',
        typeAll: 'Todos',
        typeWorksheet: 'Hoja de trabajo',
        typeQuiz: 'Preguntas',
        sortLabel: 'Ordenar por',
        sortRecientes: 'Más recientes',
        sortGustadas: 'Más gustadas',
        sortVistas: 'Más vistas',
        novistasLabel: 'No las he visto',
        filterSubmit: 'Filtrar',
        // Mobile layout pass: the `<summary>` of the `<details>` collapsing
        // level/sort/type/novistas/submit into a "Filtros" disclosure below
        // `lg:` (search stays always visible) — distinct from `filterSubmit`
        // above, which stays the actual submit button INSIDE it.
        filtersToggle: 'Filtros',
        // Filters popover (unified search header pass): "Aplicar"/"Limpiar"
        // inside the compact panel opened by the funnel button, and the
        // short label used by each removable filter chip under the title.
        applyFilters: 'Aplicar',
        panelClear: 'Limpiar',
        novistasChip: 'No vistas',
        // Card badges (heart/eye counters, "Vista" badge) and the daily pick.
        viewedBadge: 'Vista',
        dailyPickLabel: 'Actividad del día',
      },
      // Moderator queue (`/[lang]/admin/actividades`, PR E "Moderation").
      // `report.reasons` (above) is reused for the "Reportadas" tab's report
      // list — same taxonomy, no need to duplicate it here.
      moderation: {
        pageTitle: 'Moderación',
        pageDescription: 'Revisar actividades enviadas y reportadas.',
        tabPending: 'Pendientes',
        tabReported: 'Reportadas',
        empty: 'No hay actividades pendientes de revisión.',
        emptyReported: 'No hay actividades reportadas.',
        selectPrompt: 'Elegir un elemento de la lista para revisarlo.',
        byAuthor: 'Autor',
        submittedAt: 'Enviado',
        firstPublication: 'Primera publicación',
        editOfLive: 'Edición de una actividad publicada',
        publishedVersion: 'Versión publicada',
        newVersion: 'Nueva versión',
        showAnswers: 'Mostrar respuestas',
        hideAnswers: 'Ocultar respuestas',
        answersLabel: 'Respuestas',
        optionsLabel: 'Opciones',
        noAnswersYet: 'Todavía sin respuestas',
        zoneLabel: 'Zona',
        quizAnswerLabel: 'Respuesta correcta',
        approve: 'Aprobar',
        approveConfirmTitle: '¿Aprobar esta actividad?',
        approveConfirmBody: 'Va a quedar publicada de inmediato.',
        approving: 'Aprobando…',
        approveError: 'No se pudo aprobar la actividad. Intentar de nuevo.',
        reject: 'Rechazar',
        rejectDialogTitle: 'Rechazar esta actividad',
        rejectQuickPicksLabel: 'Motivos frecuentes',
        rejectQuickPicks: {
          blurry: 'La imagen no se ve con claridad.',
          incomplete: 'El contenido está incompleto.',
          wrongAnswers: 'Alguna de las respuestas marcadas es incorrecta.',
          inappropriate: 'El contenido no es apropiado.',
        },
        rejectNoteLabel: 'Nota para el autor',
        rejectNotePlaceholder: 'Explicar qué hay que corregir…',
        rejecting: 'Rechazando…',
        rejectError: 'No se pudo rechazar la actividad. Intentar de nuevo.',
        rejectNoteRequired: 'Escribir una nota antes de rechazar.',
        reportsLabel: 'Reportes',
        reportDetailsNone: 'Sin detalles adicionales.',
        restore: 'Restaurar',
        restoreConfirmTitle: '¿Restaurar esta actividad?',
        restoreConfirmBody: 'Vuelve a quedar publicada para el público.',
        restoring: 'Restaurando…',
        restoreError: 'No se pudo restaurar la actividad. Intentar de nuevo.',
        remove: 'Eliminar',
        removeConfirmTitle: '¿Eliminar esta actividad?',
        removeConfirmBody: 'Esta acción no se puede deshacer.',
        removing: 'Eliminando…',
        removeError: 'No se pudo eliminar la actividad. Intentar de nuevo.',
        confirmCancel: 'Cancelar',
        confirmAccept: 'Confirmar',
      },
    },
    // 404 copy. It used to live in a local map inside `404.astro`, which put a
    // whole page's Spanish out of reach of the neutral-Spanish guard — and that
    // is precisely where a voseo ("La página que buscás") quietly survived the
    // English-section sweep. Centralizing it is what makes it guardable.
    notFound: {
      title: 'Página no encontrada',
      body: 'La página solicitada no existe o fue movida.',
      home: 'Volver al inicio',
    },
    home: {
      hero: {
        // Infinitive, matching the register the rest of the site already uses
        // for actions ("Elegir nivel", "Revisar las respuestas"). It keeps the
        // headline's rhythm, length and `aprender` keyword intact and changes
        // only the one thing the rule is about: the direct address.
        headline: 'Aprender tecnología en tu idioma',
        subline:
          'Libros, artículos y cursos de programación pensados para la comunidad latina. Contenido claro, sin atajos, con fundamentos sólidos.',
        primaryCta: 'Explorar libros',
        secondaryCta: 'Leer noticias',
        imageAlt:
          'Ilustración de una comunidad latina aprendiendo programación con motivos andinos',
      },
      rows: {
        viewAll: 'Ver todo',
        featuredBooks: 'Libros destacados',
        latestArticles: 'Últimas noticias',
        courses: 'Cursos',
        english: 'Inglés para programadores',
      },
    },
    courses: {
      teaser: {
        badge: 'Próximamente',
        title: 'Cursos en camino',
        // "vas a poder" addressed the reader in the second person. The same
        // phrasing the English section already uses for a not-yet-available
        // state ("van a estar disponibles") keeps the promise without it, and
        // "con nosotros" went with it — "Estamos preparando" already says who.
        description:
          'Estamos preparando cursos prácticos de programación. Muy pronto van a estar disponibles para aprender paso a paso.',
        imageAlt: 'Vista previa de los próximos cursos de programación',
      },
    },
    english: {
      // Copy for the HUB route `/[lang]/ingles` (two cards: curated exercises
      // vs. community activities). Kept separate from `section` below, which
      // is now the curated-exercises picker's OWN copy at `/[lang]/ingles/propuestos`.
      hub: {
        title: 'Ejercicios de inglés',
        subtitle: 'Escoge qué quieres hacer hoy',
        description:
          'Elige entre ejercicios propuestos por nivel o actividades creadas por la comunidad.',
        proposedTitle: 'Ejercicios propuestos',
        proposedDescription: 'Ejercicios curados por nivel.',
        // Reuses `activities.explore`'s established phrasing on purpose —
        // same destination, same name for it everywhere it appears.
        communityTitle: 'Actividades de la comunidad',
        communityDescription: 'Actividades creadas por otros usuarios.',
      },
      // Copy for the curated-exercises picker `/[lang]/ingles/propuestos` and the
      // `[level]/[focus]` listing. The old "coming soon" teaser lived here and
      // was removed when the section actually shipped.
      // REGISTER: neutral Spanish, impersonal. Instructions use the infinitive
      // ("Revisar las respuestas") and descriptions avoid the second person
      // entirely. The site is not Argentina-specific, so no voseo reaches the
      // UI — enforced by a guard in `i18n.test.ts`.
      section: {
        // Names the SECTION, not its audience. "Inglés para programadores"
        // described who the section was for, which the visitor already knows by
        // the time they are looking at it; "Ejercicios de inglés" says what is
        // actually on the screen. It doubles as the `<title>`, where the shorter
        // string also survives a SERP truncation intact.
        title: 'Ejercicios de inglés',
        // `<meta name="description">`. Deliberately left as-is: it already leads
        // with "Ejercicios cortos de inglés técnico", so it reads as an
        // expansion of the new headline rather than a contradiction of it, and
        // it is the one string here that must stay a full descriptive sentence.
        description:
          'Ejercicios cortos de inglés técnico, organizados por nivel y por punto gramatical, con corrección al instante.',
        // MAINTAINER-AUTHORED, VERBATIM. "Elige" is TUTEO, and the standing
        // neutral-Spanish rule bans REGIONAL forms (`Elegí`), not the second
        // person as a category — so this passes `neutralSpanish.ts` unchanged
        // and was NOT rewritten into an infinitive to match `chooseLevel`.
        // Asserted exactly in `i18n.test.ts` so a future "consistency" pass has
        // to argue with a red test instead of quietly editing the maintainer.
        intro: 'Elige un nivel y tema para practicar en el día a día',
        chooseLevel: 'Elegir nivel',
        // The grid under a level lists LANGUAGE POINTS, not settings: someone
        // arriving here wants "conditionals", not "something about airports".
        // This is chrome and localizes; the point NAMES themselves are exercise
        // data and stay English (`FOCUS_LABELS`).
        focusesTitle: 'Puntos gramaticales',
        // Rendered as "1 ejercicio" / "7 ejercicios" — the number is prepended
        // by the page, so these stay plain nouns.
        exerciseOne: 'ejercicio',
        exerciseMany: 'ejercicios',
        empty:
          'Todavía no hay ejercicios publicados. Estamos preparando los primeros y van a estar disponibles en unos días.',
        emptyLevel: 'Todavía no hay ejercicios para este nivel.',
        emptyPair:
          'Todavía no hay ejercicios de este punto gramatical en este nivel. Probar con otro punto.',
        // Accessible name for the magnifier filter over the language-point grid.
        // It is the ONLY name that control has: the trigger is an icon and the
        // input carries a blank placeholder so the bar can animate open, so
        // without this a screen reader announces nothing but "edit text".
        searchFocus: 'Buscar puntos gramaticales',
        // Shown only when a typed query hides every card. Distinct from
        // `emptyLevel` on purpose: that one means "nothing is published here",
        // this one means "your query matched nothing" — collapsing them would
        // tell the user the level is empty when it is full.
        focusesNoResults: 'No hay puntos gramaticales que coincidan con la búsqueda.',
      },
      // Display names for the CEFR levels. The URL keeps the bare code; the
      // screen adds what it means, because "B1" alone tells a beginner nothing.
      levels: {
        A1: 'Principiante',
        A2: 'Básico',
        B1: 'Intermedio',
        B2: 'Intermedio alto',
        C1: 'Avanzado',
        C2: 'Dominio',
      },
      // NO `focuses` / `topics` / `skills` maps here, deliberately. Those are
      // exercise DATA, not chrome: their display labels are English in every
      // locale and live in `exerciseTaxonomy` (`FOCUS_LABELS` / `TOPIC_LABELS` /
      // `SKILL_LABELS`), beside the slugs they name. See
      // docs/exercise-model.md, "Authoring rules".
      //
      // Copy for the exercise detail route `/[lang]/ingles/[level]/[focus]/[slug]`.
      exercise: {
        back: 'Volver a inglés',
        level: 'Nivel',
        // NO `like` KEY. The like control became a TOGGLE, and a toggle needs
        // one name per direction chosen from state that only the island holds.
        // Its pair of words therefore lives in `LikeButton.COPY`, which that
        // component's test sweeps with `findVoseo` so the neutral-Spanish rule
        // still applies to it. Leaving a stale `like` here would look live.
        //
        // The share dialog. Impersonal register throughout: the hint is an
        // infinitive ("Escanear"), never an instruction addressed to a person,
        // and the button labels are bare verbs and participles.
        share: 'Compartir',
        shareTitle: 'Compartir este ejercicio',
        // Says what the code is FOR. "Código QR" alone names the object and
        // leaves the teacher to guess that the point is opening it elsewhere.
        shareHint:
          'Escanear el código para abrir el ejercicio en otro dispositivo.',
        shareLink: 'Enlace',
        shareCopy: 'Copiar',
        shareCopied: 'Copiado',
        shareQrAlt: 'Código QR con el enlace a este ejercicio',
        // A `<meta name="description">`, so it describes rather than instructs:
        // a noun phrase keeps it neutral without an infinitive standing alone.
        description:
          'Práctica de inglés técnico con ejercicios cortos y corrección al instante.',
        // Several phrasings instead of one. "Más ejercicios de este nivel" was
        // literally true and read like a description of the query behind it.
        // The route picks one DETERMINISTICALLY from the exercise slug
        // (`pickStable` in `exerciseCopy.ts`), so a given page always reads the
        // same way — a random pick on the SSR render path would change the
        // heading on every reload and read as a glitch.
        relatedHeadings: [
          'Otros ejercicios',
          'Tal vez te interese',
          'Para seguir practicando',
        ],
      },
    },
  },
  en: {
    meta: {
      siteDescription:
        'ChuyoCode: books, articles, and programming courses for the Latin community. Learn technology in your own language, with solid foundations.',
      booksDescription:
        'A catalog of programming and technology books curated to help you learn with solid foundations.',
      newsDescription:
        'The latest programming and technology news and articles for the Latin developer community.',
    },
    nav: {
      home: 'Home',
      books: 'Books',
      news: 'News',
      courses: 'Courses',
      englishLink: 'English',
      english: 'English',
      soon: 'Soon',
      switchTo: 'Switch to',
    },
    footer: { terms: 'Terms & Conditions', privacy: 'Privacy' },
    common: {
      back: 'Back',
      backTooltip: 'Back to the previous page',
      scrollToTop: 'Back to top',
    },
    legal: {
      titles: { terms: 'Terms and conditions', privacy: 'Privacy policy' },
      pending: 'Legal content pending',
      privacyNote:
        'We respect your privacy. We are still drafting the full version of this document; in the meantime, we do not sell or share your personal data with third parties.',
    },
    news: { readMore: 'Read more' },
    article: { back: 'Back to news' },
    auth: {
      title: 'Sign in',
      description: 'Sign in with email and password, Google, or a sign-in link.',
      linkInvalid:
        'That link is invalid or has expired. Request a new one with the form below.',
      signedIn: 'Signed in.',
      alreadySignedIn: 'You are already signed in on this browser.',
      signOut: 'Sign out',
      google: 'Continue with Google',
      googleUnavailable:
        'Google sign-in is not available right now. Try email and password instead.',
      orDivider: 'or',
      nuevaClave: {
        title: 'New password',
        description: 'Choose a new password for the account.',
      },
      userMenu: {
        signIn: 'Sign in',
        signUp: 'Sign up',
        accountMenu: 'Account',
        planFree: 'Free',
        planPremium: 'Premium',
        createActivity: 'Create activity',
        myActivities: 'My activities',
        moderation: 'Moderation',
        signOut: 'Sign out',
      },
    },
    authoring: {
      newTitle: 'Create exercise',
      newDescription: 'Create a new English exercise.',
      editTitle: 'Edit exercise',
      editDescription: 'Edit this exercise.',
    },
    activities: {
      untitledTitle: 'Untitled',
      start: {
        pageTitle: 'Create activity',
        pageDescription: 'Choose the type of content for a new activity.',
        heading: 'What do you want to start with?',
        worksheet: {
          title: 'Worksheet',
          description: 'Upload a worksheet or a PDF and add answers on top.',
        },
        questions: {
          title: 'Questions',
          description: 'Multiple-choice questions and other interactive exercises.',
        },
        creating: 'Creating the activity…',
        createError: 'Could not create the activity. Try again.',
      },
      editor: {
        pageTitle: 'Edit activity',
        pageDescription: 'Edit this activity.',
        titleLabel: 'Title',
        levelLabel: 'Level',
        levelNone: 'No level',
        previewOn: 'Preview',
        previewOff: 'Back to editing',
        save: 'Save',
        saving: 'Saving…',
        saved: 'Changes saved',
        unsaved: 'Unsaved changes',
        saveError: 'Could not save. Try again.',
        saveRetry: 'Retry',
        unloadWarning: 'There are unsaved changes. They will be lost if this page is closed.',
        blocksEmpty: 'No blocks yet. Add the first one to get started.',
        addBlock: 'Add block',
        moveUp: 'Move block up',
        moveDown: 'Move block down',
        dragHandle: 'Reorder',
        deleteBlock: 'Delete block',
        deleteConfirmTitle: 'Delete this block?',
        deleteConfirmBody: 'This cannot be undone.',
        deleteConfirmCancel: 'Cancel',
        deleteConfirmAccept: 'Delete',
        worksheetLabel: 'Worksheet',
        quizLabel: 'Questions',
        // Creator polish round 2.
        blockNameLabel: 'Block name',
        blockNamePlaceholder: 'Block name',
        blockDefaultNamePrefix: 'Sheet',
        collapseBlock: 'Collapse block',
        expandBlock: 'Expand block',
        collapseAll: 'Collapse all',
        expandAll: 'Expand all',
        zoneCountOne: 'zone',
        zoneCountMany: 'zones',
        questionCountOne: 'question',
        questionCountMany: 'questions',
        rotateLeft: 'Rotate left',
        rotateRight: 'Rotate right',
        blockIndex: 'Go to a block',
        blockIndexTitle: 'Blocks',
        undo: 'Undo',
        redo: 'Redo',
        shortcutsHelp: 'Keyboard shortcuts',
        shortcutsTitle: 'Keyboard shortcuts',
        shortcutsClose: 'Close',
        shortcutUndo: 'Undo',
        shortcutRedo: 'Redo',
        shortcutSave: 'Save',
        shortcutEscape: 'Deselect',
        shortcutZoomIn: 'Zoom in',
        shortcutZoomOut: 'Zoom out',
        shortcutNewZone: 'New zone',
        moveToolbar: 'Move toolbar',
        dockToolbar: 'Dock',
        savingStatus: 'Saving changes',
        savedStatus: 'Changes saved',
        errorStatus: 'Could not save',
        saveErrorRetry: "Couldn't save, retry",
        incompleteNoZones: 'This worksheet needs at least one answer zone.',
        incompleteNoAnswers: "This zone doesn't have an answer yet.",
        incompleteQuizNoSlots: 'This questions block needs at least one question.',
        incompleteQuizNoAnswer: "This question doesn't have an answer yet.",
        incompleteQuizTooFewOptions: 'This question needs at least two options.',
        incompleteQuizAnswerNotInPool: 'The marked answer must be among the options.',
        incompleteTooFewOptions: 'This multiple-choice zone needs at least two options.',
        incompleteAnswerNotInOptions: 'The marked answer must be one of the options.',
        unsavedModalTitle: 'This exercise has unsaved changes',
        unsavedModalSaveAndLeave: 'Save and leave',
        unsavedModalLeaveWithoutSaving: 'Leave without saving',
        unsavedModalCancel: 'Cancel',
        statusDraft: 'Draft',
        statusPendingReview: 'In review',
        statusLive: 'Published',
        statusRejected: 'Rejected',
        reviewNoteLabel: "Reviewer's note",
        submitForReview: 'Submit for review',
        submitDialogTitle: 'Submit this activity for review',
        submitDialogNote: 'A moderator will review your activity before it is published.',
        submitRightsLabel: 'I confirm I have the right to use this material.',
        submitConfirm: 'Submit',
        submitCancel: 'Cancel',
        submitting: 'Submitting…',
        submitErrors: {
          rights_required: 'Confirming the right to use this material is required.',
          invalid_title: 'Add a title before submitting this activity.',
          no_blocks: 'Add at least one block before submitting this activity.',
          missing_zones: 'Every worksheet needs at least one answer zone.',
          invalid_blocks: "This activity's content is not valid.",
          no_draft: 'There are no new changes to submit for review.',
          submit_failed: 'Could not submit the activity. Try again.',
        },
      },
      worksheet: {
        uploadTitle: 'Upload an image or a PDF',
        uploadHint: 'Drop a file here, or pick one from this device.',
        uploadButton: 'Choose file',
        uploadDragActive: 'Drop the file here',
        uploadProgress: 'Uploading…',
        pdfPagesTitle: 'Choose PDF pages',
        pdfPagesHint: 'Up to 10 pages. Each chosen page is added as its own block.',
        pdfPageLabel: 'Page',
        pdfConfirm: 'Add pages',
        pdfThumbnailsLoading: 'Generating thumbnails…',
        pdfThumbnailsHint: 'Choose up to 10 pages to add as blocks.',
        pdfSelectAll: 'Select all',
        pdfSelectedCountLabel: 'selected',
        pdfAddPagesPrefix: 'Add',
        pdfPageCountOne: 'page',
        pdfPageCountMany: 'pages',
        pdfThumbnailsTruncated:
          'This PDF has more than 40 pages: showing the first 40. To pick another page, use the page number field.',
        pdfThumbnailsSwitchToText: 'Choose by page number',
        errors: {
          unsupported_media_type: 'That file type is not supported.',
          empty_body: 'The file is empty.',
          payload_too_large: 'The file is too large.',
          not_webp: 'The image could not be processed.',
          invalid_dimensions: 'The image must be between 200 and 2400 pixels on a side.',
          upload_limit_reached: 'The upload limit was reached.',
          upload_failed: 'Could not upload the file. Try again.',
          pdf_failed: 'Could not process the PDF.',
        },
        addZoneHint: 'Draw a box over the image to add an answer.',
        zoneKindText: 'Text',
        zoneKindChoice: 'Choice',
        zoneKindLabel: 'Answer type',
        zoneAnswersLabel: 'Accepted answers',
        zoneAnswerPlaceholder: 'Answer',
        zoneAnswerAdd: 'Add answer',
        zoneAnswerRemove: 'Remove answer',
        zoneOptionsLabel: 'Options',
        zoneOptionPlaceholder: 'Option',
        zoneOptionAdd: 'Add option',
        zoneOptionRemove: 'Remove option',
        zoneOptionCorrect: 'Correct',
        zoneSpeakLabel: 'Text to listen to',
        zoneSpeakPlaceholder: 'Text to read aloud',
        zoneDelete: 'Delete zone',
        zoneMinOptions: 'At least 2 options are needed.',
        zoneAnswerNotInOptions: 'Every answer must also be one of the options.',
        noZonesYet: 'No zones drawn on this image yet.',
        panelEmpty: 'Draw a box on the sheet or select one to edit it.',
        panelEmptyHint:
          'Shortcuts: V for the Zone tool, H for Hand, Enter or N to create a zone centered in what is visible, arrow keys move a selected zone, Delete removes it, wheel or the buttons below zoom.',
        zoomOut: 'Zoom out',
        zoomIn: 'Zoom in',
        zoomFit: 'Fit',
        zoomReset: '100%',
        zoomLevel: 'Zoom level',
        zoomInputLabel: 'Zoom percentage',
        toolZone: 'Zone',
        toolZoneTooltip: 'Zone (V)',
        toolHand: 'Hand',
        toolHandTooltip: 'Hand (H)',
        zoneCreatedAnnouncement: 'Zone created',
      },
      player: {
        notGraded: 'Preview: this view does not grade answers.',
        textPlaceholder: 'Type the answer',
        choicePlaceholder: 'Choose an option',
        correct: 'Correct',
        incorrect: 'Incorrect',
        quizUnavailable: 'This part of the exercise cannot be answered here yet.',
        zoneSheetTitle: 'Answer',
        zoneEmpty: 'Not answered',
        zonePrev: 'Previous',
        zoneNext: 'Next',
        zoneDone: 'Done',
        zoneOf: 'Zone',
      },
      practice: {
        pageDescription: 'Practise this English activity: worksheets and questions with instant feedback.',
        back: 'Back to activities',
        noLevel: 'No level',
        check: 'Check',
        retry: 'Try again',
        score: 'Score',
        viewedFirstTime: 'First time',
        viewedBefore: "You've seen this",
        viewedTimesMany: 'times',
        heartAdd: 'Heart',
        heartRemove: 'Remove heart',
        heartsOne: 'heart',
        heartsMany: 'hearts',
      },
      report: {
        button: 'Report',
        dialogTitle: 'Report this activity',
        reasonLabel: 'Reason',
        reasons: {
          inappropriate: 'Inappropriate content',
          off_topic: 'Off topic',
          copyright: 'Copyright',
          wrong_answers: 'Wrong answers',
          other: 'Other',
        },
        detailsLabel: 'Details (optional)',
        detailsPlaceholder: 'Add more information…',
        cancel: 'Cancel',
        submit: 'Send report',
        submitting: 'Sending…',
        success: "Thanks, we'll take a look.",
        close: 'Close',
        errors: {
          self_report: 'You cannot report your own activity.',
          invalid_reason: 'Choose a reason before sending the report.',
          invalid_details: 'The details are too long.',
          report_failed: 'Could not send the report. Try again.',
        },
      },
      myActivities: {
        pageTitle: 'My activities',
        pageDescription: 'Activities created so far: edit, view, or delete each one.',
        empty: 'No activities created yet.',
        createCta: 'Create activity',
        noLevel: 'No level',
        blockCountOne: 'block',
        blockCountMany: 'blocks',
        pendingChangesNote: 'Changes in review',
        edit: 'Edit',
        view: 'View',
        delete: 'Delete',
        deleteConfirmTitle: 'Delete this activity?',
        deleteConfirmBody: 'This cannot be undone.',
        deleteConfirmCancel: 'Cancel',
        deleteConfirmAccept: 'Delete',
        deleteError: 'Could not delete the activity. Try again.',
      },
      explore: {
        pageTitle: 'Community activities',
        pageDescription: "Activities created by other ChuyoCode users: worksheets and questions to practise with.",
        heading: 'Community activities',
        cardTitle: 'Community activities',
        cardDescription: 'Practise with worksheets and questions created by other users.',
        empty: 'No activities published yet.',
        emptyFiltered: 'No activities match these filters.',
        clearFilters: 'Clear filters',
        allLevels: 'All levels',
        noLevel: 'No level',
        blockCountOne: 'block',
        blockCountMany: 'blocks',
        pagination: 'Pagination',
        prevPage: 'Previous',
        nextPage: 'Next',
        pageLabel: 'Page',
        ofLabel: 'of',
        searchLabel: 'Search activities',
        searchPlaceholder: 'Search by title…',
        levelLabel: 'Level',
        typeLabel: 'Type',
        typeAll: 'All',
        typeWorksheet: 'Worksheet',
        typeQuiz: 'Questions',
        sortLabel: 'Sort by',
        sortRecientes: 'Most recent',
        sortGustadas: 'Most liked',
        sortVistas: 'Most viewed',
        novistasLabel: "I haven't seen these",
        filterSubmit: 'Filter',
        filtersToggle: 'Filters',
        applyFilters: 'Apply',
        panelClear: 'Clear',
        novistasChip: 'Unseen',
        viewedBadge: 'Seen',
        dailyPickLabel: "Today's activity",
      },
      moderation: {
        pageTitle: 'Moderation',
        pageDescription: 'Review submitted and reported activities.',
        tabPending: 'Pending',
        tabReported: 'Reported',
        empty: 'No activities awaiting review.',
        emptyReported: 'No reported activities.',
        selectPrompt: 'Choose an item from the list to review it.',
        byAuthor: 'Author',
        submittedAt: 'Submitted',
        firstPublication: 'First publication',
        editOfLive: 'Edit of a published activity',
        publishedVersion: 'Published version',
        newVersion: 'New version',
        showAnswers: 'Show answers',
        hideAnswers: 'Hide answers',
        answersLabel: 'Answers',
        optionsLabel: 'Options',
        noAnswersYet: 'No answers yet',
        zoneLabel: 'Zone',
        quizAnswerLabel: 'Correct answer',
        approve: 'Approve',
        approveConfirmTitle: 'Approve this activity?',
        approveConfirmBody: 'It will be published immediately.',
        approving: 'Approving…',
        approveError: 'Could not approve the activity. Try again.',
        reject: 'Reject',
        rejectDialogTitle: 'Reject this activity',
        rejectQuickPicksLabel: 'Common reasons',
        rejectQuickPicks: {
          blurry: 'The image is not clear enough.',
          incomplete: 'The content is incomplete.',
          wrongAnswers: 'One of the marked answers is wrong.',
          inappropriate: 'The content is not appropriate.',
        },
        rejectNoteLabel: 'Note for the author',
        rejectNotePlaceholder: 'Explain what needs to be fixed…',
        rejecting: 'Rejecting…',
        rejectError: 'Could not reject the activity. Try again.',
        rejectNoteRequired: 'Write a note before rejecting.',
        reportsLabel: 'Reports',
        reportDetailsNone: 'No additional details.',
        restore: 'Restore',
        restoreConfirmTitle: 'Restore this activity?',
        restoreConfirmBody: 'It becomes published for the public again.',
        restoring: 'Restoring…',
        restoreError: 'Could not restore the activity. Try again.',
        remove: 'Remove',
        removeConfirmTitle: 'Remove this activity?',
        removeConfirmBody: 'This cannot be undone.',
        removing: 'Removing…',
        removeError: 'Could not remove the activity. Try again.',
        confirmCancel: 'Cancel',
        confirmAccept: 'Confirm',
      },
    },
    notFound: {
      title: 'Page not found',
      body: 'The page you are looking for does not exist or was moved.',
      home: 'Back to home',
    },
    home: {
      hero: {
        headline: 'Learn technology in your own language',
        subline:
          'Books, articles, and programming courses built for the Latin community. Clear content, no shortcuts, solid foundations.',
        primaryCta: 'Explore books',
        secondaryCta: 'Read news',
        imageAlt:
          'Illustration of a Latin community learning to code with Andean motifs',
      },
      rows: {
        viewAll: 'View all',
        featuredBooks: 'Featured books',
        latestArticles: 'Latest news',
        courses: 'Courses',
        english: 'English for developers',
      },
    },
    courses: {
      teaser: {
        badge: 'Coming soon',
        title: 'Courses on the way',
        description:
          'We are building hands-on programming courses. Very soon you will be able to learn step by step with us.',
        imageAlt: 'Preview of the upcoming programming courses',
      },
    },
    english: {
      hub: {
        title: 'English exercises',
        subtitle: 'Choose what you want to do today',
        description:
          'Choose between curated exercises by level or activities created by the community.',
        proposedTitle: 'Curated exercises',
        proposedDescription: 'Exercises curated by level.',
        communityTitle: 'Community activities',
        communityDescription: 'Activities created by other users.',
      },
      section: {
        // Matches the Spanish move: name the section, not its audience.
        title: 'English exercises',
        description:
          'Short technical English exercises, organized by level and language point, with instant feedback.',
        // Mirrors the new Spanish subtitle's brevity and meaning — one line, an
        // instruction, no trailing period, and the same two choices ("nivel y
        // tema"). "practise" is this repo's spelling throughout.
        intro: 'Pick a level and a topic to practise day to day',
        chooseLevel: 'Choose your level',
        focusesTitle: 'Language points',
        exerciseOne: 'exercise',
        exerciseMany: 'exercises',
        empty:
          'No exercises published yet. We are preparing the first ones — check back in a few days.',
        emptyLevel: 'No exercises at this level yet.',
        emptyPair:
          'No exercises for this language point at this level yet. Try another one.',
        searchFocus: 'Search language points',
        focusesNoResults: 'No language points match that search.',
      },
      levels: {
        A1: 'Beginner',
        A2: 'Elementary',
        B1: 'Intermediate',
        B2: 'Upper intermediate',
        C1: 'Advanced',
        C2: 'Proficient',
      },
      // No `focuses` / `topics` / `skills` here either — see the `es` block.
      exercise: {
        back: 'Back to English',
        level: 'Level',
        // No `like` — see the `es` block.
        share: 'Share',
        shareTitle: 'Share this exercise',
        shareHint: 'Scan the code to open this exercise on another device.',
        shareLink: 'Link',
        shareCopy: 'Copy',
        shareCopied: 'Copied',
        shareQrAlt: 'QR code linking to this exercise',
        description: 'Practice technical English with short exercises and instant feedback.',
        relatedHeadings: [
          'More exercises',
          'You might also like',
          'Keep practising',
        ],
      },
    },
  },
} as const satisfies Record<Lang, unknown>;


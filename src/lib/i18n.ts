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
        'ChuyoCode: inglés y tecnología en tu idioma. Actividades interactivas para docentes y estudiantes, libros y noticias de programación para la comunidad latina.',
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
    // Footer simplification ("opción A", owner decision 2026-10-06): the
    // footer itself only ever shows these three — `reembolsos`/`credits`
    // link labels were removed from here (dead code) once their links moved
    // out of the footer; both pages stay reachable from Premium/Terms
    // instead (see `Footer.astro`'s own header).
    footer: {
      terms: 'Términos y Condiciones',
      privacy: 'Privacidad',
      premium: 'Premium',
    },
    // Chrome shared by any page that mounts it (`BackButton`, `ScrollToTop`) —
    // not tied to one section, unlike `english`/`activities`/`legal` below.
    common: {
      back: 'Volver',
      backTooltip: 'Volver a la página anterior',
      scrollToTop: 'Volver arriba',
      // Toast copy (sonner, PR 1) — short, transient confirmations/errors
      // shared across features, not tied to one section.
      toast: {
        linkCopied: 'Enlace copiado',
        submittedForReview: 'Enviado a revisión',
        activityDuplicated: 'Actividad duplicada',
        reportSent: 'Reporte enviado',
        autosaveError: 'No se pudo guardar automáticamente',
      },
    },
    // Internal reference-only page (`/[lang]/admin/ui`, PR 1) — moderators
    // only, never linked from ordinary navigation.
    admin: {
      ui: {
        pageTitle: 'Sistema de diseño',
        pageDescription:
          'Referencia interna de los controles, botones y tarjetas del sistema de diseño.',
      },
      // Course authoring (`/[lang]/admin/cursos`, `/[lang]/admin/cursos/[id]`)
      // — moderators only, never linked from ordinary navigation. The
      // Courses feature itself stays hidden until payments exist.
      cursos: {
        pageTitle: 'Cursos',
        pageDescription: 'Crear y administrar los cursos del sitio.',
        empty: 'Todavía no hay cursos.',
        createTitle: 'Nuevo curso',
        createButton: 'Crear curso',
        creating: 'Creando…',
        fields: {
          slug: 'Slug (URL)',
          title: 'Título',
          subtitle: 'Subtítulo',
          description: 'Descripción',
          level: 'Nivel',
          includedInPremium: 'Incluido en Premium',
          priceCents: 'Precio de compra individual (USD)',
        },
        status: {
          draft: 'Borrador',
          published: 'Publicado',
          archived: 'Archivado',
        },
        actions: {
          publish: 'Publicar',
          archive: 'Archivar',
          unpublish: 'Volver a borrador',
          save: 'Guardar cambios',
          saving: 'Guardando…',
        },
        editTitle: 'Editar curso',
        detailsTitle: 'Datos del curso',
        accessTitle: 'Otorgar acceso',
        accessDescription: 'Da acceso de por vida a este curso a un usuario, por su correo.',
        grantEmailLabel: 'Correo del usuario',
        grantButton: 'Otorgar acceso',
        granting: 'Otorgando…',
        ownersTitle: 'Con acceso',
        ownersEmpty: 'Nadie tiene acceso individual todavía.',
        revoke: 'Revocar',
        revoking: 'Revocando…',
        source: {
          purchase: 'Compra',
          grant: 'Otorgado',
          promo: 'Promoción',
        },
        errors: {
          invalid_slug: 'El slug debe ser minúsculas, números y guiones (sin espacios).',
          invalid_title: 'El título es obligatorio (máximo 120 caracteres).',
          invalid_subtitle: 'El subtítulo no puede superar 200 caracteres.',
          invalid_level: 'Nivel inválido.',
          invalid_price: 'El precio no puede ser negativo.',
          duplicate_slug: 'Ya existe un curso con ese slug.',
          invalid_status: 'Estado inválido.',
          user_not_found: 'No se encontró un usuario con ese correo.',
          already_owned: 'Ese usuario ya tiene acceso a este curso.',
          unavailable: 'El servicio no está disponible en este momento.',
          db_error: 'Ocurrió un error. Inténtalo de nuevo.',
          bad_request: 'Solicitud inválida.',
          invalid_duration: 'La duración debe ser un número mayor a cero.',
          invalid_kind: 'Tipo de lección inválido.',
          invalid_content: 'El contenido de la lección no es válido para su tipo.',
          activity_not_live: 'Esa actividad no está publicada todavía.',
          invalid_order: 'No se pudo reordenar. Vuelve a intentarlo.',
        },
        modules: {
          title: 'Módulos',
          empty: 'Este curso todavía no tiene módulos.',
          addLabel: 'Nuevo módulo',
          addPlaceholder: 'Título del módulo',
          addButton: 'Agregar módulo',
          adding: 'Agregando…',
          rename: 'Renombrar',
          renaming: 'Renombrando…',
          renamePlaceholder: 'Nuevo título del módulo',
          save: 'Guardar',
          cancel: 'Cancelar',
          delete: 'Eliminar módulo',
          deleting: 'Eliminando…',
          confirmDelete: '¿Eliminar este módulo? También se eliminan todas sus lecciones.',
          moveUp: 'Subir módulo',
          moveDown: 'Bajar módulo',
        },
        lessons: {
          empty: 'Este módulo todavía no tiene lecciones.',
          addButton: 'Agregar lección',
          adding: 'Agregando…',
          edit: 'Editar',
          save: 'Guardar',
          cancel: 'Cancelar',
          delete: 'Eliminar',
          deleting: 'Eliminando…',
          confirmDelete: '¿Eliminar esta lección?',
          moveUp: 'Subir lección',
          moveDown: 'Bajar lección',
          previewTag: 'Vista previa',
          fields: {
            title: 'Título',
            kind: 'Tipo',
            kindText: 'Texto',
            kindVideo: 'Video',
            kindActivity: 'Actividad',
            markdown: 'Contenido (Markdown)',
            markdownPreview: 'Vista previa',
            videoUrl: 'URL del video',
            videoUrlHint: 'Solo YouTube o Vimeo, con https.',
            activitySearch: 'Buscar actividad publicada',
            activitySearchPlaceholder: 'Escribir un título…',
            activitySearching: 'Buscando…',
            activityNone: 'No se encontraron actividades.',
            activitySelected: 'Actividad elegida',
            activityChange: 'Cambiar',
            duration: 'Duración (minutos)',
            isPreview: 'Vista previa gratuita (sin acceso pagado)',
          },
        },
      },
    },
    legal: {
      titles: {
        terms: 'Términos y condiciones',
        privacy: 'Política de privacidad',
        reembolsos: 'Política de reembolsos',
      },
      pending: 'Contenido legal pendiente',
      privacyNote:
        'Respetamos tu privacidad. Todavía estamos redactando la versión completa de este documento; mientras tanto, no vendemos ni compartimos tus datos personales con terceros.',
    },
    // Credits page (`/[lang]/creditos`, visual-identity decision, 2026-10-04).
    // The actual license body copy lives in `CreditsContent.astro` (same
    // pattern as `legal` above: long-form text stays out of this map).
    credits: {
      pageTitle: 'Créditos',
      pageDescription:
        'Créditos y licencias de los recursos de terceros que usa ChuyoCode.',
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
        'Ese enlace no es válido o ya venció. Solicita uno nuevo con el formulario de abajo.',
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
        'El acceso con Google no está disponible en este momento. Prueba con correo y contraseña.',
      orDivider: 'o',
      // Window-manager architecture, robustness pass (owner report): a
      // session that expires WHILE a desk window's own iframe is open lands
      // this exact page there — too small/chrome-less a place to sign back
      // in. Shown only in that one case (`Sec-Fetch-Dest: iframe`), with a
      // script that bounces the REAL browser tab here instead; this text is
      // its no-JS fallback / the instant before that script runs.
      windowRedirecting: 'Tu sesión expiró. Te llevamos a la pantalla de acceso…',
      windowRedirectingContinue: 'Continuar',
      nuevaClave: {
        title: 'Nueva contraseña',
        description: 'Elegir una nueva contraseña para la cuenta.',
      },
      // Age/legal consent (Ley N° 29733 §2/§4, owner-approved wording,
      // `@lib/ageConsent`). Read directly by TWO client islands, not just
      // server-rendered page chrome — `PasswordAuthForm`'s sign-up checkbox
      // and the standalone consent screen's `ConsentForm` — so the
      // legally-approved sentence and its two legal links live in exactly
      // ONE place instead of two local COPY maps drifting apart. Same
      // precedent as `userMenu` below, already read by a client island.
      // `sentence` carries two placeholders, `{terms}` and `{privacy}`,
      // replaced with `termsLinkText`/`privacyLinkText` as the two embedded
      // links (`AgeConsentCheckbox`) — never translate the markers.
      consent: {
        pageTitle: 'Confirma tu edad',
        pageDescription: 'Antes de continuar, confirma lo siguiente.',
        sentence:
          'Tengo 14 años o más, o cuento con el consentimiento de mi padre, madre o apoderado. Acepto los {terms} y la {privacy}.',
        termsLinkText: 'Términos',
        privacyLinkText: 'Política de privacidad',
        checkboxHint: 'Marca la casilla para continuar.',
        continue: 'Continuar',
        continuing: 'Continuando…',
        genericError: 'No se pudo completar la solicitud. Inténtalo de nuevo.',
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
        // Links to the signed-in visitor's own account settings
        // (`/[lang]/perfil`, T3) — replaces the "Eliminar mi cuenta" entry
        // that used to live directly in this menu; see that page's own
        // "Zona de peligro" section for where it moved to.
        profile: 'Perfil',
        signOut: 'Cerrar sesión',
        // Account deletion (owner decision, 2026-10-04). Flat keys, not a
        // nested object — `UserMenu`'s own `labels` prop is typed
        // `Record<keyof UI_LABELS['es']['auth']['userMenu'], string>`
        // (every value a leaf string), the same reason this whole map has
        // no nested objects anywhere else.
        deleteAccount: 'Eliminar mi cuenta',
        deleteAccountDialogTitle: 'Eliminar tu cuenta',
        // Owner-authored copy, verbatim.
        deleteAccountDialogBody:
          'Tus actividades publicadas seguirán disponibles para la comunidad a nombre de ChuyoCode. Tus borradores, tus corazones y los datos de tu cuenta se eliminarán. Esta acción no se puede deshacer.',
        deleteAccountConfirmLabel: 'Escribe ELIMINAR para confirmar',
        deleteAccountConfirmWord: 'ELIMINAR',
        deleteAccountCancel: 'Cancelar',
        deleteAccountButton: 'Eliminar mi cuenta',
        deleteAccountSuccessToast: 'Tu cuenta se eliminó correctamente.',
        deleteAccountErrorGeneric: 'No se pudo eliminar tu cuenta. Inténtalo de nuevo.',
      },
    },
    // Perfil page (`/[lang]/perfil`, T3, owner decision 2026-10-05): the
    // signed-in visitor's own account settings — display name, password
    // (email/password accounts only), plan, and "Eliminar mi cuenta" (moved
    // here from the user menu — reuses `auth.userMenu`'s own
    // delete-account copy, not duplicated here).
    profile: {
      pageTitle: 'Perfil',
      pageDescription: 'Gestiona tu nombre, tu contraseña y tu cuenta.',
      nameSectionTitle: 'Nombre',
      nameLabel: 'Nombre para mostrar',
      nameSaveButton: 'Guardar',
      nameSaving: 'Guardando…',
      nameSuccessToast: 'Tu nombre se actualizó.',
      nameErrorGeneric: 'No se pudo actualizar tu nombre. Inténtalo de nuevo.',
      nameErrorInvalid: 'Escribe un nombre válido (1 a 60 caracteres, sin caracteres de control).',
      emailSectionTitle: 'Correo electrónico',
      emailReadOnlyNote:
        'Para cambiar tu correo electrónico necesitamos verificarlo primero — todavía no está disponible.',
      passwordSectionTitle: 'Contraseña',
      currentPasswordLabel: 'Contraseña actual',
      newPasswordLabel: 'Contraseña nueva',
      confirmNewPasswordLabel: 'Confirmar contraseña nueva',
      passwordSaveButton: 'Cambiar contraseña',
      passwordSaving: 'Cambiando…',
      passwordSuccessToast: 'Tu contraseña se actualizó.',
      passwordErrorGeneric: 'No se pudo cambiar tu contraseña. Inténtalo de nuevo.',
      passwordErrorInvalidCurrent: 'La contraseña actual no es correcta.',
      passwordErrorMismatch: 'Las contraseñas nuevas no coinciden.',
      // Mirrors `MIN_PASSWORD_LENGTH` (`src/lib/authValidation.ts`) — a
      // plain string, not a template, same simplicity as every other label
      // in this file; keep both in sync if that constant ever changes.
      passwordErrorTooShort: 'Usa al menos 8 caracteres.',
      passwordErrorReauthRequired: 'Por tu seguridad, vuelve a iniciar sesión y prueba de nuevo.',
      passwordErrorSamePassword: 'La contraseña nueva debe ser diferente de la actual.',
      // Supabase's Turnstile captcha rejection (`captcha_failed`) — distinct
      // from `passwordErrorInvalidCurrent`; mirrors `PasswordAuthForm`'s own
      // local `captchaError`/`captchaPending` copy.
      passwordErrorCaptchaFailed: 'No pudimos verificar que eres una persona. Inténtalo de nuevo.',
      passwordCaptchaPending: 'Esperando verificación…',
      passwordGoogleOnlyNote: 'Iniciaste sesión con Google, así que no tienes una contraseña que cambiar aquí.',
      planSectionTitle: 'Plan',
      planUpgradeLink: 'Conoce Premium',
      dangerZoneTitle: 'Zona de peligro',
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
        heading: 'Elige el punto de partida',
        worksheet: {
          title: 'Worksheet',
          description: 'Sube una hoja o PDF y marca dónde van las respuestas.',
        },
        questions: {
          title: 'Básico',
          description: 'Escribe preguntas y juégalas de muchas formas.',
        },
        match: {
          title: 'Une las parejas',
          description: 'Arrastra cada respuesta junto a su pareja.',
        },
        reorder: {
          title: 'Reordenar',
          description: 'Arrastra las palabras para ordenar la oración.',
        },
        cloze: {
          title: 'Completar la frase',
          description: 'Arrastra las palabras a los espacios en blanco de la frase.',
        },
        groupsort: {
          title: 'Ordenar por grupos',
          description: 'Arrastra cada elemento a su grupo correcto.',
        },
        createError: 'No se pudo crear la actividad. Inténtalo de nuevo.',
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
        saveError: 'No se pudo guardar. Inténtalo de nuevo.',
        saveRetry: 'Reintentar',
        unloadWarning: 'Tienes cambios sin guardar. Vas a perderlos si cierras la página.',
        blocksEmpty: 'Todavía no hay bloques. Agrega el primero para empezar.',
        // Empty block list (creator polish round 4, owner feedback #3): the
        // list itself always shows the picker right below this line — no
        // separate "+" click needed first (unlike `blocksEmpty` above, which
        // is `EditorSideToolbar`'s own "no blocks to jump to" popover text).
        blocksEmptyChooseNext: 'Elige con qué seguir',
        addBlock: 'Agregar bloque',
        moveUp: 'Subir bloque',
        moveDown: 'Bajar bloque',
        dragHandle: 'Reordenar',
        deleteBlock: 'Eliminar bloque',
        deleteConfirmTitle: '¿Eliminar este bloque?',
        deleteConfirmBody: 'Esta acción no se puede deshacer.',
        deleteConfirmCancel: 'Cancelar',
        deleteConfirmAccept: 'Eliminar',
        // "Cambiar imagen" (one-sheet redesign): replaces the per-block
        // delete — with a single block, starting over IS replacing its
        // image. The confirm step only shows when the worksheet already has
        // zones (a new image would silently invalidate them).
        changeImage: 'Cambiar imagen',
        changeImageConfirmTitle: '¿Cambiar la imagen de esta hoja?',
        changeImageConfirmBody: 'Las zonas dibujadas sobre la imagen actual se perderán.',
        changeImageConfirmAccept: 'Cambiar',
        worksheetLabel: 'Worksheet',
        quizLabel: 'Básico',
        // Creator polish round 2.
        blockNameLabel: 'Nombre del bloque',
        blockNamePlaceholder: 'Nombre del bloque',
        blockDefaultNamePrefix: 'Hoja',
        zoneCountOne: 'zona',
        zoneCountMany: 'zonas',
        questionCountOne: 'pregunta',
        questionCountMany: 'preguntas',
        rotateLeft: 'Girar a la izquierda',
        rotateRight: 'Girar a la derecha',
        blockIndex: 'Ir a un bloque',
        blockIndexTitle: 'Bloques',
        // Thin active-sheet bar (owner decision 2026-10-07, "Barra fina
        // debajo"): replaces the accordion — one active block at a time,
        // switched with these two arrows.
        sheetPrevious: 'Hoja anterior',
        sheetNext: 'Hoja siguiente',
        sheetPosition: (current: number, total: number) => `${current} de ${total}`,
        sheetMoreActions: 'Más acciones',
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
        // Dock/float toggle (the "clip"): pinned (docked, inside the window)
        // vs. released (undocked, floating anywhere on screen).
        undockToolbar: 'Soltar y flotar',
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
        incompleteNoImage: 'Esta hoja de trabajo todavía no tiene una imagen. Sube un archivo antes de enviarla.',
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
        // "Duplicar y adaptar" credit line (D7): shown in the editor header
        // when this activity was created from another one, composed at the
        // call site as `${basedOnPrefix}${originalTitle}${basedOnSuffix}` —
        // same composition pattern as `practice.heartsLabel`'s own callers.
        basedOnPrefix: 'Basado en «',
        basedOnSuffix: '» de la comunidad',
        // "Ver como presentación" (worksheet zoom tour, sprint week 3): opens
        // a full-screen overlay presenting the editor's own CURRENT (unsaved
        // included) blocks — `PresentationIsland` reused, not a new route.
        viewAsPresentation: 'Ver como presentación',
        // Submit-for-review dialog.
        submitForReview: 'Enviar a revisión',
        submitDialogTitle: 'Enviar esta actividad a revisión',
        submitDialogNote: 'La actividad va a ser revisada por un moderador antes de publicarse.',
        // Non-blocking projection warnings (sprint week 3): shown above the
        // rights checkbox in the SAME submit dialog, never disabling
        // "Enviar" — `listProjectionWarnings` (`presentationSlides.ts`).
        projectionWarningsHeading: 'Antes de proyectar',
        projectionWarningQuizPromptTooLong:
          'Esta pregunta es muy larga para proyectarse bien; intenta acortarla.',
        projectionWarningWorksheetZoneTooSmall:
          'Esta zona es muy pequeña para proyectarse bien; hazla más grande.',
        submitRightsLabel: 'Confirmo que tengo el derecho de usar este material.',
        submitConfirm: 'Enviar',
        submitCancel: 'Cancelar',
        submitting: 'Enviando…',
        // Keyed by the endpoint's own reason codes (`enviar.ts`'s header).
        submitErrors: {
          rights_required: 'Debes confirmar que tienes el derecho de usar este material.',
          invalid_title: 'Pon un título antes de enviar la actividad.',
          no_blocks: 'Agrega al menos un bloque antes de enviar la actividad.',
          missing_zones: 'Cada hoja de trabajo necesita al menos una zona de respuesta.',
          invalid_blocks: 'El contenido de la actividad no es válido.',
          no_draft: 'No hay cambios nuevos para enviar a revisión.',
          submit_failed: 'No se pudo enviar la actividad. Inténtalo de nuevo.',
        },
        // "Desktop" redesign PART 6b: the editor renders as a WINDOW over
        // the desk, same shell as the practice page (PART 6a) — these three
        // mirror `activities.practice`'s own `windowClose`/`windowMinimize`/
        // `windowFullScreen` exactly (the traffic lights' accessible names).
        windowClose: 'Cerrar',
        windowMinimize: 'Minimizar',
        windowFullScreen: 'Pantalla completa',
        // The window title bar's own `<b>` when the activity has no title
        // yet (brand-new, untitled) — `DeskWindow`'s `title` prop fallback.
        titleFallback: 'Nueva actividad',
        // The title bar's own muted autosave status (approved mockup
        // `ventana-crear-1440.png`'s "Guardado hace un momento") — distinct
        // from `savingStatus`/`savedStatus`/`errorStatus` above (the SIDE
        // TOOLBAR's own indicator text): the title bar reads as ambient,
        // more conversational copy, same two live states plus the shared
        // `errorStatus` for the error one.
        titlebarSaving: 'Guardando…',
        titlebarSaved: 'Guardado hace un momento',
      },
      worksheet: {
        // Empty worksheet block's drop zone (creator polish round 4, owner
        // feedback #2): `uploadTitle` is the big centered call to action,
        // `uploadHint` names the accepted formats/size underneath the button.
        uploadTitle: 'Arrastra tu hoja de trabajo o PDF aquí',
        uploadHint: 'JPG, PNG, WEBP o PDF. Tamaño máximo: 2 MB por imagen.',
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
        pdfThumbnailsHint: 'Elige hasta 10 páginas para agregar como bloques.',
        pdfSelectAll: 'Seleccionar todas',
        pdfSelectedCountLabel: 'seleccionadas',
        pdfAddPagesPrefix: 'Agregar',
        pdfPageCountOne: 'página',
        pdfPageCountMany: 'páginas',
        pdfThumbnailsTruncated:
          'Este PDF tiene más de 40 páginas: se muestran las primeras 40. Para elegir otra página, usa el número de página.',
        pdfThumbnailsSwitchToText: 'Elegir por número de página',
        // Task progress panel (coherent loading states, item 4): replaces
        // the drop zone entirely while a PDF/image task runs — see
        // `src/lib/activities/uploadTask.ts` and `WorksheetUploader.tsx`'s
        // `stageLabel`. Assembled as "<prefix> <i> <taskOf> <n>", e.g.
        // "Convirtiendo página 2 de 5" / "Optimizando imagen 1 de 1".
        taskPreparingPdf: 'Preparando el PDF…',
        taskConvertingPage: 'Convirtiendo página',
        taskUploadingPage: 'Subiendo página',
        taskOptimizingImage: 'Optimizando imagen',
        taskUploadingImage: 'Subiendo',
        taskOf: 'de',
        taskCancel: 'Cancelar',
        taskRetry: 'Reintentar',
        taskChooseAnother: 'Elegir otro archivo',
        // Several images/PDF pages -> one sheet (one-sheet redesign): the
        // task panel's own flat label while combining (no "N de M" to
        // count — see `WorksheetUploader.tsx`'s own `stageLabel`), and the
        // calm notice shown when more than `MAX_STITCH_SOURCES` (5) were
        // picked.
        taskCombiningPages: 'Combinando páginas…',
        stitchTooManyPages: 'Puedes combinar hasta 5 páginas o imágenes en una sola hoja; se usarán las primeras 5.',
        errors: {
          unsupported_media_type: 'Ese tipo de archivo no está admitido.',
          empty_body: 'El archivo está vacío.',
          payload_too_large: 'El archivo es demasiado grande.',
          not_webp: 'La imagen no pudo procesarse.',
          invalid_dimensions: 'La imagen debe medir entre 200 y 2400 píxeles de lado.',
          upload_limit_reached: 'Se alcanzó el límite de archivos subidos.',
          upload_failed: 'No se pudo subir el archivo. Inténtalo de nuevo.',
          pdf_failed: 'No se pudo procesar el PDF.',
          stitch_too_large: 'La hoja combinada es demasiado grande para subirla. Intenta con menos páginas o imágenes más pequeñas.',
        },
        addZoneHint: 'Dibuja un recuadro sobre la imagen para agregar una respuesta.',
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
        // "¿Por qué?" explicación (D5): un campo opcional por zona, que se
        // muestra al alumno solo después de comprobar, y solo si esa zona
        // quedó incorrecta.
        zoneExplanationLabel: '¿Por qué? (explicación)',
        zoneExplanationPlaceholder: 'Explicación opcional',
        zoneExplanationHint: 'Se muestra al alumno si se equivoca',
        zoneDelete: 'Eliminar zona',
        zoneMinOptions: 'Se necesitan al menos 2 opciones.',
        zoneAnswerNotInOptions: 'Cada respuesta debe estar entre las opciones.',
        noZonesYet: 'Todavía no hay zonas dibujadas sobre esta imagen.',
        panelEmpty: 'Dibuja un recuadro sobre la hoja o selecciona uno para editarlo.',
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
        // "¿Por qué?" explicación (D5) — el botón que abre el popover con la
        // explicación, mostrado solo para una zona incorrecta que tiene una.
        explanationButtonLabel: 'Ver explicación',
        explanationHeading: '¿Por qué?',
      },
      // Quiz block game modes (D1, "Una actividad, muchos juegos"): the
      // switcher between "Preguntas"/"Tarjetas"/"Parejas" plus the copy for
      // the two alternate games themselves.
      gameModes: {
        modeQuiz: 'Básico',
        modeCards: 'Tarjetas',
        modeMatch: 'Parejas',
        modeReorder: 'Reordenar',
        // Footer hint (practice player redesign's Comprobar/Reintentar row):
        // shown only while a quiz tab sits in Tarjetas/Parejas, since
        // Comprobar keeps grading the Preguntas-mode answers only.
        gradesQuizModeHint: 'Comprobar corrige el modo "Básico".',
        // Tarjetas (flashcards).
        cardFlipHint: 'Tocar o pulsar Espacio para dar vuelta',
        cardPrev: 'Anterior',
        cardNext: 'Siguiente',
        cardShuffle: 'Barajar',
        cardKnewIt: 'La sabía',
        cardReviewIt: 'Repasar',
        cardReviewPileTitle: 'Para repasar',
        cardReplayReview: 'Repasar de nuevo',
        cardsDone: '¡Listo! Repasaste todas las tarjetas.',
        // Parejas (matching) — big drag-and-drop board (game-feel pass):
        // drag an answer tile onto a prompt's empty slot, "Comprobar" grades
        // the attempt, "Reiniciar" starts a fresh shuffled round.
        matchReset: 'Reiniciar',
        matchCheck: 'Comprobar',
        matchRetry: 'Reintentar',
        // "4 de 5 correctas" — composed around the learner's score.
        matchResultOf: 'de',
        matchResultCorrect: 'correctas',
        matchRemovePrefix: 'Quitar ficha',
        matchEmptySlot: 'Casilla vacía',
        matchTrayLabel: 'Fichas disponibles',
        matchSoundMute: 'Silenciar sonido',
        matchSoundUnmute: 'Activar sonido',
        // Reordenar (Wordwall "Reordenar palabras"): one sentence at a time,
        // its words scrambled into a tray; drag or tap each word into the
        // line below, in order, to rebuild it. "Comprobar" grades the current
        // sentence, advancing on a correct attempt.
        reorderCheck: 'Comprobar',
        reorderRetry: 'Reintentar',
        // "3 de 4 correctas" — composed around the learner's score.
        reorderResultOf: 'de',
        reorderResultCorrect: 'correctas',
        reorderSoundMute: 'Silenciar sonido',
        reorderSoundUnmute: 'Activar sonido',
        reorderPrev: 'Oración anterior',
        reorderNext: 'Oración siguiente',
        // "1 de 4" — the sentence stepper's own position readout.
        reorderSentenceOf: 'de',
        reorderTrayLabel: 'Palabras disponibles',
        reorderLineLabel: 'Oración',
        reorderLineEmpty: 'Toca o arrastra una palabra para empezar',
        reorderRemovePrefix: 'Quitar palabra',
        // Cartas (Wordwall "Speaking cards"): a shuffled deck dealt one card
        // at a time, each with a question to answer out loud.
        modeSpeak: 'Cartas',
        speakDeal: 'Repartir',
        speakNext: 'Siguiente carta',
        speakReveal: 'Ver respuesta',
        speakCounterPrefix: 'Carta',
        speakCounterOf: 'de',
        speakReshuffle: 'Barajar de nuevo',
        // Ruleta (Wordwall "Spin the wheel").
        modeWheel: 'Ruleta',
        wheelSpin: 'Girar',
        wheelSpinning: 'Girando…',
        wheelReveal: 'Ver respuesta',
        wheelRemoveOnExit: 'Eliminar al salir',
        wheelExhausted: 'No quedan elementos en la ruleta.',
        wheelLandedPrefix: 'La ruleta se detuvo en:',
        // Anagrama (Wordwall "Anagram"): reorder the scrambled letters to
        // spell the answer, clued by the question's own prompt.
        modeAnagram: 'Anagrama',
        anagramCounterPrefix: 'Palabra',
        anagramCounterOf: 'de',
        anagramBackspace: 'Deshacer',
        anagramNext: 'Siguiente palabra',
        anagramCorrectMessage: '¡Correcto!',
        anagramWrongMessage: 'Inténtalo de nuevo.',
        anagramDone: '¡Listo! Resolviste todos los anagramas.',
        anagramPlayAgain: 'Jugar de nuevo',
        // Ahorcado (Wordwall "Hangman"): guess the letters of a single-word
        // answer, clued by the question's own prompt, before running out of
        // lives (a friendly balloon row — no gallows imagery).
        modeHangman: 'Ahorcado',
        hangmanCounterPrefix: 'Palabra',
        hangmanCounterOf: 'de',
        hangmanLivesLabel: 'Vidas',
        hangmanWon: '¡Lo lograste!',
        hangmanLost: 'Se acabaron los intentos.',
        hangmanNext: 'Siguiente palabra',
        hangmanDone: '¡Listo! Jugaste todas las palabras.',
        hangmanPlayAgain: 'Jugar de nuevo',
        // Verdadero o falso (Wordwall "True or false"): the question's gap
        // filled with either its correct answer or a wrong pool option.
        modeTrueFalse: 'Verdadero o falso',
        tfTrue: 'Verdadero',
        tfFalse: 'Falso',
        tfCounterPrefix: 'Afirmación',
        tfCounterOf: 'de',
        tfCorrect: 'Correcto',
        tfWrong: 'Incorrecto',
        tfScorePrefix: 'Puntaje',
        tfPlayAgain: 'Jugar de nuevo',
        // Abre la caja (Wordwall "Open the box"): a grid of numbered boxes,
        // each hiding one question.
        modeOpenBox: 'Abre la caja',
        openboxHint: 'Toca una caja para abrirla.',
        openboxReveal: 'Ver respuesta',
        openboxBoxAriaPrefix: 'Caja',
        openboxOpenedSuffix: 'abierta',
        openboxClosedSuffix: 'cerrada',
        // Completar la frase (Wordwall "Complete the sentence"): one sentence
        // at a time, its blanks shown inline, a shared word bank below.
        modeCloze: 'Completar la frase',
        clozeCheck: 'Comprobar',
        clozeRetry: 'Reintentar',
        // "3 de 4 correctas" — composed around the learner's score.
        clozeResultOf: 'de',
        clozeResultCorrect: 'correctas',
        clozeSoundMute: 'Silenciar sonido',
        clozeSoundUnmute: 'Activar sonido',
        clozePrev: 'Oración anterior',
        clozeNext: 'Oración siguiente',
        // "1 de 4" — the sentence stepper's own position readout.
        clozeSentenceOf: 'de',
        clozeTrayLabel: 'Palabras disponibles',
        clozeBlankEmpty: 'Casilla vacía',
        clozeRemovePrefix: 'Quitar palabra',
        // Ordenar por grupos (Wordwall "Group sort"): every item shuffled
        // into a tray, the groups shown as large boxes to drag each item
        // into. "Comprobar" grades the whole board at once.
        modeGroupSort: 'Ordenar por grupos',
        groupSortCheck: 'Comprobar',
        groupSortRetry: 'Reintentar',
        // "9 de 9 bien ubicados" — composed around the learner's score.
        groupSortResultOf: 'de',
        groupSortResultCorrect: 'bien ubicados',
        groupSortSoundMute: 'Silenciar sonido',
        groupSortSoundUnmute: 'Activar sonido',
        groupSortTrayLabel: 'Elementos disponibles',
        groupSortEmptyGroup: 'Grupo vacío',
        groupSortRemovePrefix: 'Quitar elemento',
      },
      // Practice page (`/[lang]/ingles/actividades/[id]`, PR D "Activities
      // practice"). `WorksheetPlayer`'s own `player.*` copy above covers the
      // per-zone inputs; this block is the page's chrome around it.
      practice: {
        pageDescription: 'Practicar esta actividad de inglés: hojas de trabajo y preguntas con corrección al instante.',
        back: 'Volver a actividades',
        noLevel: 'Sin nivel',
        // "Imprimir" (D6): links to the print-optimized page.
        print: 'Imprimir',
        // "Presentar" (presentation mode v1): links to the full-screen,
        // projector-facing deck. Shown only when the activity has at least
        // one Preguntas (quiz) item — see `[id].astro`'s own `canPresent`.
        present: 'Presentar',
        check: 'Comprobar',
        retry: 'Reintentar',
        score: 'Puntaje',
        viewedFirstTime: 'Primera vez',
        viewedBefore: 'Ya lo viste',
        viewedTimesMany: 'veces',
        // Title-bar eye icon's accessible name (owner feedback 2026-10-06,
        // `ActivityViewBadge`'s own header) — same count-phrase shape as
        // `heartsOne`/`heartsMany` below.
        viewsOne: 'vista',
        viewsMany: 'vistas',
        // "Corazón" toggle (Descubrir/discovery). Two names, one per
        // direction — same reasoning as `LikeButton`'s own `COPY`: the
        // action the press performs, not the current state (`aria-pressed`
        // already carries that).
        heartAdd: 'Dar corazón',
        heartRemove: 'Quitar corazón',
        heartsOne: 'corazón',
        heartsMany: 'corazones',
        // "Duplicar y adaptar" (D7): any signed-in visitor, author included.
        duplicate: 'Duplicar',
        duplicating: 'Duplicando…',
        // Keyed by the endpoint's own reason codes (`duplicar.ts`'s header).
        duplicateErrors: {
          not_found: 'Esta actividad ya no está disponible.',
          daily_limit: 'Se alcanzó el límite diario de duplicados. Inténtalo mañana.',
          upload_limit: 'No hay espacio para copiar las imágenes de esta actividad. Libera espacio antes de duplicar.',
          copy_failed: 'No se pudo duplicar la actividad. Inténtalo de nuevo.',
          create_failed: 'No se pudo duplicar la actividad. Inténtalo de nuevo.',
        },
        // Credit line (D7): shown once a duplicate gets approved and
        // published, on ITS OWN practice page — the original's page shows
        // nothing extra. Same composition as `editor.basedOnPrefix/Suffix`.
        basedOnPrefix: 'Basado en «',
        basedOnSuffix: '» de la comunidad',
        // "Compartir" dialog (D8): extends the shared `ShareDialog`
        // (`@components/islands/ShareDialog`, first built for curated
        // exercises) with a WhatsApp link, a QR download and the native
        // share sheet.
        share: 'Compartir',
        shareTitle: 'Compartir esta actividad',
        shareHint: 'Escanea el código para abrir la actividad en otro dispositivo.',
        shareLink: 'Enlace',
        shareCopy: 'Copiar',
        shareCopied: 'Copiado',
        shareQrAlt: 'Código QR con el enlace a esta actividad',
        shareWhatsapp: 'WhatsApp',
        shareDownloadQr: 'Descargar QR',
        shareNative: 'Más opciones',
        // Guest play: friendly line shown only to an anonymous visitor,
        // right below the header row — invites them to sign up without
        // blocking anything they can already do (play, check answers,
        // share, present). Neutral Latin-American tuteo, same register
        // `src/lib/neutralSpanish.ts` enforces site-wide (owner decision,
        // 2026-10-04) — "Estás"/"Crea"/"tus" address the reader directly.
        guestBanner: 'Estás jugando como invitado. Crea tu cuenta gratis para dar corazones y crear tus propias actividades.',
        guestSignUp: 'Crear cuenta',
        // "Desktop" redesign PART 6a (owner spec 2026-10-06): the practice
        // page opens as a WINDOW over the desk — see `DeskWindow.astro`'s own
        // header. The three "traffic light" buttons' accessible names; close
        // and minimize do the exact same thing (both return to the desk),
        // same posture as the approved mockup's own shared `data-close`.
        windowClose: 'Cerrar',
        windowMinimize: 'Minimizar',
        windowFullScreen: 'Pantalla completa',
        // "Más" overflow menu (PART 6a phone layout fix, 2026-10-06): below
        // the `desk:` breakpoint, Duplicar/Reportar/Presentar/Imprimir move
        // behind this one trigger so the title bar's actions fit one row —
        // see `DeskWindow.astro`'s own header.
        windowMore: 'Más',
        // "Modo enfoque" (full-screen exercise mode, owner spec 2026-10-07:
        // "quiero uno de pantalla completa que solo muestre el ejercicio sin
        // bordes"): deliberately NOT named "Pantalla completa" like
        // `windowFullScreen` above — that is a DIFFERENT, already-shipped
        // control (the green light, which just maximizes the WINDOW, chrome
        // and all) living in the SAME title bar; reusing its exact name here
        // would give two differently-behaving buttons the identical
        // accessible name. This one hides every bit of chrome (window, tabs,
        // title) and shows only the exercise.
        focusMode: 'Modo enfoque',
        focusModeExit: 'Salir del modo enfoque',
        focusModePrev: 'Página anterior',
        focusModeNext: 'Página siguiente',
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
          invalid_reason: 'Elige un motivo antes de enviar el reporte.',
          invalid_details: 'Los detalles son demasiado largos.',
          report_failed: 'No se pudo enviar el reporte. Inténtalo de nuevo.',
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
        // "Compartir" per row (D8), LIVE activities only — reuses the
        // practice page's own `practice.share*` copy for the nested dialog
        // (trigger label composed here since this list is a different
        // vocabulary group, see `MisActividadesIsland.tsx`'s own header).
        share: 'Compartir',
        delete: 'Eliminar',
        deleteConfirmTitle: '¿Eliminar esta actividad?',
        deleteConfirmBody: 'Esta acción no se puede deshacer.',
        deleteConfirmCancel: 'Cancelar',
        deleteConfirmAccept: 'Eliminar',
        deleteError: 'No se pudo eliminar la actividad. Inténtalo de nuevo.',
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
        typeWorksheet: 'Worksheet',
        typeQuiz: 'Básico',
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
        // Window chrome (community-list-as-a-window pass, 2026-10-07) —
        // same wording as `practice.windowClose`/etc, duplicated per
        // section like every other window-chrome label in this file.
        windowClose: 'Cerrar',
        windowMinimize: 'Minimizar',
        windowFullScreen: 'Pantalla completa',
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
        selectPrompt: 'Elige un elemento de la lista para revisarlo.',
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
        clozeDistractorsLabel: 'Distractores',
        explanationLabel: 'Explicación',
        approve: 'Aprobar',
        approveConfirmTitle: '¿Aprobar esta actividad?',
        approveConfirmBody: 'Va a quedar publicada de inmediato.',
        approving: 'Aprobando…',
        approveError: 'No se pudo aprobar la actividad. Inténtalo de nuevo.',
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
        rejectError: 'No se pudo rechazar la actividad. Inténtalo de nuevo.',
        rejectNoteRequired: 'Escribe una nota antes de rechazar.',
        reportsLabel: 'Reportes',
        reportDetailsNone: 'Sin detalles adicionales.',
        restore: 'Restaurar',
        restoreConfirmTitle: '¿Restaurar esta actividad?',
        restoreConfirmBody: 'Vuelve a quedar publicada para el público.',
        restoring: 'Restaurando…',
        restoreError: 'No se pudo restaurar la actividad. Inténtalo de nuevo.',
        remove: 'Eliminar',
        removeConfirmTitle: '¿Eliminar esta actividad?',
        removeConfirmBody: 'Esta acción no se puede deshacer.',
        removing: 'Eliminando…',
        removeError: 'No se pudo eliminar la actividad. Inténtalo de nuevo.',
        confirmCancel: 'Cancelar',
        confirmAccept: 'Confirmar',
      },
      // Print page (`/[lang]/ingles/actividades/[id]/imprimir`, D6). A
      // separate, minimal-layout page — no site header/footer/nav, light
      // theme for paper — so its copy stays a sibling of `practice` rather
      // than reusing that section's own vocabulary.
      print: {
        pageDescription: 'Versión para imprimir de esta actividad de inglés.',
        noLevel: 'Sin nivel',
        print: 'Imprimir',
        includeAnswers: 'Incluir respuestas',
        choicesLabel: 'Opciones',
        answersHeading: 'Clave de respuestas',
        explanationLabel: 'Por qué',
        worksheetLabel: 'Worksheet',
        quizLabel: 'Básico',
        // "Une las parejas" in print (build item 5): the block heading above
        // its pair list — reads oddly as "Básico" (the Google-Forms-style
        // quiz label) when the block is actually a pair list.
        matchLabel: 'Une las parejas',
        // "Reordenar" in print (Wordwall templates build): same reasoning as
        // `matchLabel` above — "Básico" would misname a sentence list.
        reorderLabel: 'Reordenar',
        // "Completar la frase" in print: same reasoning as `matchLabel`.
        clozeLabel: 'Completar la frase',
        clozeBankLabel: 'Banco de palabras',
        // "Ordenar por grupos" in print: same reasoning as `matchLabel`.
        groupSortLabel: 'Ordenar por grupos',
        groupSortItemsLabel: 'Elementos',
      },
      // Presentation mode v1 ("Preguntas", presentation mode pass,
      // `/[lang]/ingles/actividades/[id]/presentar`). A separate,
      // bare-layout page (no site header/footer/nav, light Inglés theme) —
      // same reasoning as `print` above — so its copy stays a sibling of
      // `practice` rather than reusing that section's own vocabulary.
      present: {
        pageDescription:
          'Presentación en pantalla completa de esta actividad de inglés, pensada para proyectar en clase.',
        noLevel: 'Sin nivel',
        questionsCountOne: 'pregunta',
        questionsCountMany: 'preguntas',
        // Worksheet zoom tour (sprint week 3): the cover's own count line
        // composes this alongside `questionsCountOne/Many` when the
        // activity has presentable worksheet pages too.
        worksheetCountOne: 'hoja',
        worksheetCountMany: 'hojas',
        scanHint: 'Escanea el código para abrir esta actividad en el teléfono.',
        qrAlt: 'Código QR para abrir esta actividad en un teléfono',
        // "Mostrar QR" control (owner feedback 2026-10-06): the QR moved
        // from the old cover-only screen to an on-demand overlay, reachable
        // from any slide via this button or the `Q` key.
        showQr: 'Mostrar QR',
        hideQr: 'Ocultar QR',
        summaryTitle: '¡Listo!',
        restart: 'Volver a empezar',
        prev: 'Anterior',
        next: 'Siguiente',
        reveal: 'Mostrar respuesta',
        fullscreenEnter: 'Pantalla completa',
        fullscreenExit: 'Salir de pantalla completa',
        exit: 'Salir',
        // Generalized from "Pregunta" (worksheet zoom tour, sprint week 3):
        // the progress readout now also counts a worksheet overview/zone
        // slide, which "Pregunta 3 de 8" would misname while looking at a
        // worksheet, not a question.
        progressPrefix: 'Diapositiva',
        ofLabel: 'de',
        correctBadge: 'Correcta',
        answerLabel: 'Respuesta',
        explanationLabel: 'Por qué',
        // The worksheet zoom tour's own zone badges/labels (sprint week 3).
        zoneLabel: 'Zona',
        liveCover: 'Portada',
        liveSummary: 'Resumen',
        liveRevealed: 'Respuesta revelada',
        liveWorksheetOverview: 'Vista general de la hoja',
        // "Une las parejas" in presentation mode (build item 5): one slide
        // lists every pair's prompt; "Mostrar respuesta" reveals every
        // answer at once — the simplest shape a teacher can run with a
        // class projected on a screen, no drag gesture needed.
        matchTitle: 'Une las parejas',
        // "Reordenar" in presentation mode (Wordwall templates build): one
        // slide per sentence, its words shown scrambled; "Mostrar respuesta"
        // reveals the sentence in its correct order.
        reorderTitle: 'Reordenar',
        // "Completar la frase" in presentation mode: one slide per sentence,
        // its blanks shown as lines; "Mostrar respuesta" fills them in.
        clozeTitle: 'Completar la frase',
        // "Ordenar por grupos" in presentation mode: one combined slide,
        // every group listed by name; "Mostrar respuesta" fills each with
        // its own items.
        groupSortTitle: 'Ordenar por grupos',
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
        // Tuteo imperative, matching the site's neutral Latin-American
        // register (owner decision, 2026-10-04). Keeps the headline's
        // rhythm, length and `aprender` keyword intact.
        headline: 'Aprende tecnología en tu idioma',
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
      // Inglés product banner on the home (full-width illustration with the
      // copy over its empty paper area). Two entry points, honest about what
      // exists today: creating an activity (`/{lang}/crear`) and practicing
      // one (`/{lang}/ingles/actividades`); both are login-gated.
      ingles: {
        label: 'Inglés · English',
        title: 'Aprende y enseña inglés jugando',
        intro: 'Actividades interactivas para enseñar y practicar inglés, en español.',
        teachersCta: 'Crear mi actividad',
        learnersCta: 'Explorar actividades',
        note: 'Crear y jugar es gratis.',
      },
    },
    courses: {
      teaser: {
        badge: 'Próximamente',
        title: 'Cursos en camino',
        // "vas a poder" is valid tuteo (owner decision, 2026-10-04) — it is
        // no longer rewritten into the third person to dodge the reader.
        description:
          'Estamos preparando cursos prácticos de programación. Muy pronto vas a poder aprender paso a paso.',
        imageAlt: 'Vista previa de los próximos cursos de programación',
      },
      // The hidden Courses feature itself — catalog (`/[lang]/cursos`) and
      // landing (`/[lang]/cursos/[slug]`). `teaser` above is unrelated
      // marketing copy for a "coming soon" card; this is the real, currently
      // unlinked feature.
      catalog: {
        pageTitle: 'Cursos',
        pageDescription: 'Catálogo de cursos de programación.',
        empty: 'Todavía no hay cursos publicados.',
        premiumBadge: 'Incluido en Premium',
        lifetimeBadge: 'de por vida',
        lessonSingular: 'lección',
        lessonsPlural: 'lecciones',
      },
      landing: {
        levelLabel: 'Nivel',
        syllabusTitle: 'Contenido del curso',
        lessonKind: { text: 'Texto', video: 'Video', activity: 'Actividad' },
        previewTag: 'Vista previa',
        lockedLabel: 'Bloqueada',
        durationSuffix: 'min',
        ctaContinue: 'Continuar',
        ctaStart: 'Empezar',
        ctaPremium: 'Hazte Premium',
        ctaBuyLifetime: 'Comprar de por vida',
        paymentsSoon: 'Pagos próximamente',
        moderatorPreviewNotice: 'Vista de moderador: este curso no está publicado.',
      },
      player: {
        sidebarToggle: 'Contenido del curso',
        prevLesson: 'Anterior',
        nextLesson: 'Siguiente',
        lockedTitle: 'Esta lección es de pago',
        lockedBody: 'Hazte Premium o compra este curso de por vida para verla.',
        activityUnavailable: 'Esta actividad ya no está disponible.',
      },
    },
    // Premium pricing page (`/[lang]/premium`, owner decision 2026-10-04).
    // Payments are not live yet (Paddle pending): every purchase CTA uses
    // `comingSoon` below and is NOT a working checkout — shared by the two
    // paid plan cards and the comparison table's Premium-only rows.
    // `comparison.rows` mirrors the Free/Premium feature lists from the same
    // decision, in the same order; `faq` mirrors the owner's own four
    // questions, the refund one phrased as instructed since there is no
    // `/[lang]/legal/reembolsos` page yet (`legal/[page].astro`'s own
    // `LEGAL_PAGES` allow-list: `terms`/`privacy` only).
    premium: {
      label: 'Premium',
      title: 'Premium desde US$1 al mes',
      intro:
        'Una sola membresía para llevar tu progreso, tu nivel y tus actividades privadas a todos lados. Mientras terminamos de activar los pagos, todo lo de hoy sigue gratis.',
      priceDisclaimer: 'Precios en dólares (US$). Pueden aplicar impuestos de tu país.',
      comingSoon: 'Próximamente',
      recommendedBadge: 'Recomendado',
      plans: {
        free: {
          name: 'Free',
          price: 'US$0',
          note: 'Para siempre.',
          cta: 'Empieza gratis',
        },
        annual: {
          name: 'Anual',
          price: 'US$12/año',
          note: 'Equivale a US$1 al mes.',
        },
        monthly: {
          name: 'Mensual',
          price: 'US$2,99/mes',
          note: 'Paga mes a mes.',
        },
      },
      founderNote:
        'Precio fundador: US$9,99 al año, de por vida, para los primeros 200 suscriptores.',
      comparison: {
        heading: 'Free vs. Premium',
        featureHeader: 'Qué incluye',
        freeHeader: 'Free',
        premiumHeader: 'Premium',
        rows: [
          { feature: 'Crear actividades', free: 'Sí, sin límite por ahora', premium: 'Sí' },
          { feature: 'Todos los modos de juego', free: 'Sí', premium: 'Sí' },
          { feature: 'Modo presentación', free: 'Sí', premium: 'Sí' },
          { feature: 'Compartir por enlace, QR o WhatsApp', free: 'Sí', premium: 'Sí' },
          { feature: 'Imprimir', free: 'Sí', premium: 'Sin marca de agua (Próximamente)' },
          { feature: 'Juego como invitado para tus alumnos', free: 'Sí', premium: 'Sí' },
          { feature: 'Ejercicios curados con explicaciones «¿Por qué?»', free: 'Sí', premium: 'Sí' },
          { feature: 'Progreso guardado en este dispositivo', free: 'Próximamente', premium: 'Próximamente' },
          { feature: 'Progreso sincronizado y repaso de errores', free: '—', premium: 'Próximamente' },
          { feature: 'Nivel MCER estimado con certificado verificable', free: '—', premium: 'Próximamente' },
          { feature: 'Actividades y colecciones privadas por unidad', free: '—', premium: 'Próximamente' },
          { feature: 'Reportes de clase', free: '—', premium: 'Próximamente' },
          { feature: 'Voces naturales', free: '—', premium: 'Próximamente' },
          { feature: 'Práctica de speaking con IA (con tope mensual)', free: '—', premium: 'Próximamente' },
          { feature: 'Cursos incluidos', free: '—', premium: 'Próximamente' },
        ],
      },
      faq: {
        heading: 'Preguntas frecuentes',
        items: [
          {
            q: '¿Cuándo podré pagar?',
            a: 'Todavía estamos activando los pagos. En cuanto estén listos, vas a poder suscribirte desde esta misma página.',
            link: null,
          },
          {
            q: '¿Puedo cancelar cuando quiera?',
            a: 'Sí, vas a poder cancelar cuando quieras, sin permanencia mínima.',
            link: null,
          },
          {
            // Owner decision 2026-10-04 (refund proposal): full refund within
            // 14 days of the first payment or of a renewal not used since —
            // see `RefundsContent.astro`/`legal/reembolsos` for the full
            // policy, now that that page exists (`legal/[page].astro`'s
            // `LEGAL_PAGES` allow-list).
            q: '¿Hay reembolso?',
            a: 'Sí: tienes 14 días desde tu primer pago (o desde una renovación, si no usaste Premium después) para pedir el reembolso completo. Lee el detalle en nuestra',
            link: { href: '/legal/reembolsos', label: 'política de reembolsos' },
          },
          {
            q: '¿Qué pasa con mis actividades si no pago?',
            a: 'Siguen siendo tuyas y gratis. Free no tiene fecha de vencimiento.',
            link: null,
          },
        ],
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
          'Practica inglés con actividades de la comunidad para cada nivel.',
        // Reuses `activities.explore`'s established phrasing on purpose —
        // same destination, same name for it everywhere it appears.
        communityTitle: 'Actividades de la comunidad',
        communityDescription: 'Actividades creadas por otros usuarios.',
        // Live count on the community folder ("1 actividad"). The number is
        // prepended by the page — these stay plain nouns.
        activityCountOne: 'actividad',
        activityCountMany: 'actividades',
        // "Para ti hoy" strip: the daily activity (its own highlight label
        // lives on `activities.explore.dailyPickLabel`, reused as-is) plus
        // the most-hearted activity published in the last 7 days.
        todayTitle: 'Para ti hoy',
        weeklyPickLabel: 'Lo más querido de la semana',
        // Heading over the CEFR quick-jump row.
        levelShortcutTitle: 'Ir directo a tu nivel',
        // Minimized-windows tray (owner feedback 2026-10-06): a slot next to
        // the levels dock, `@lib/ui/minimizedWindows`'s own `<nav>` and each
        // chip's "×" button.
        trayLabel: 'Ventanas minimizadas',
        trayRemoveLabel: 'Quitar de la bandeja',
        trayMoreLabel: 'Ver {n} ventanas más',
        // Window-manager architecture, robustness pass (owner spec): the
        // calm notice shown instead of opening a 9th window when none of
        // the minimized ones could be closed to make room.
        maxWindowsNotice: 'Ya tienes muchas ventanas abiertas. Cierra alguna para abrir otra.',
        // "Desktop" redesign PART 1 (owner spec 2026-10-06, item B): the
        // hub-only "by ChuyoCode" header link's accessible name + tooltip.
        backToChuyoCode: 'Regresar a ChuyoCode',
        // "Desktop" redesign PART 3 (owner spec 2026-10-06): the desk's own
        // centred greeting — `{name}` is replaced by the signed-in
        // visitor's first name (`greetingFallback` when there is none, e.g.
        // no session, or a display name that resolves to nothing usable).
        // `greetingQuestion` NEVER wraps on desktop (owner spec: "the second
        // line never wraps") — `index.astro`'s own `desk:whitespace-nowrap`
        // is what enforces that, not this string.
        greetingNamed: 'Hola, {name}.',
        greetingFallback: 'Hola.',
        greetingQuestion: '¿Qué practicamos hoy?',
        greetingSubtitle: 'Abre una carpeta para elegir un ejercicio, o salta directo a tu nivel.',
        // Landmark names for the desk's own `<nav>`/`<section>` regions —
        // never shown visually, just for screen-reader navigation.
        foldersLabel: 'Carpetas',
        widgetsLabel: 'Tu escritorio',
        // "Desktop" redesign PART 4 (owner spec 2026-10-06): weather +
        // "Frase del día" player widgets, draggable positions, and the
        // header's "Ordenar escritorio" icon.
        weatherLabel: 'Clima en {city}',
        weatherUnavailable: 'Clima no disponible',
        // Weather widget attribution (footer simplification "opción A",
        // owner decision 2026-10-06): the MET Norway CC BY 4.0 credit now
        // also sits next to the data it is about, not just on
        // `/[lang]/creditos` (`CreditsContent.astro`'s own "Datos del
        // clima" section, same URL).
        weatherAttribution: 'Datos: MET Norway',
        playerTitle: 'Frase del día',
        playerPrev: 'Anterior',
        playerNext: 'Siguiente',
        playerPlay: 'Escuchar',
        playerPause: 'Pausar',
        playerUnavailable: 'Audio no disponible en este dispositivo',
        arrangeDesktop: 'Ordenar escritorio',
        // "Desktop" redesign PART 5 (owner spec 2026-10-06): the floating
        // character "helper" with a grammar-tip speech bubble, bottom-left
        // of the hub only. `{name}` is replaced with the speaking
        // character's own display name (`@/content/characters`).
        helperLandmarkLabel: 'Ayuda',
        helperAvatarLabel: 'Ayuda de {name}',
        helperOtherTip: 'Otro tip',
        helperClose: 'Cerrar ayuda',
      },
      // Copy for the curated-exercises picker `/[lang]/ingles/propuestos` and the
      // `[level]/[focus]` listing. The old "coming soon" teaser lived here and
      // was removed when the section actually shipped.
      // REGISTER: neutral Latin-American tuteo. Instructions address the
      // reader as "tú" ("Revisa las respuestas", "Elige tu nivel"). The site
      // is not Argentina-specific, so no voseo reaches the UI — enforced by
      // a guard in `i18n.test.ts`.
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
        // MAINTAINER-AUTHORED, VERBATIM. "Elige" is tuteo, matching the
        // standing neutral-Spanish rule exactly (tuteo, no voseo) — kept
        // asserted exactly in `i18n.test.ts` regardless.
        intro: 'Elige un nivel y tema para practicar en el día a día',
        // Matches `hub.levelShortcutTitle` ("Ir directo a tu nivel") and the
        // English copy's own "Choose your level".
        chooseLevel: 'Elige tu nivel',
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
          'Todavía no hay ejercicios de este punto gramatical en este nivel. Prueba con otro punto.',
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
        // The share dialog. Tuteo throughout: the hint addresses the reader
        // directly ("Escanea"), and the button labels are bare verbs and
        // participles.
        share: 'Compartir',
        shareTitle: 'Compartir este ejercicio',
        // Says what the code is FOR. "Código QR" alone names the object and
        // leaves the teacher to guess that the point is opening it elsewhere.
        shareHint:
          'Escanea el código para abrir el ejercicio en otro dispositivo.',
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
      // Placement-test draft (`/[lang]/ingles/nivel`, hidden route, never
      // linked). ~30 multiple-choice items, A1 to B2; the result lives only
      // in this browser's `localStorage` (`@lib/placement/storage.ts`) — no
      // server round trip. See that page's own header for the full picture.
      placement: {
        pageTitle: 'Nivel de inglés',
        pageDescription:
          'Un test de opción múltiple para descubrir tu nivel aproximado de inglés, de A1 a B2.',
        intro: {
          title: 'Nivel de inglés',
          description:
            'Responde 30 preguntas de opción múltiple para descubrir tu nivel aproximado, de A1 a B2. No hay límite de tiempo.',
          start: 'Comenzar el test',
          lastResultPrefix: 'Tu último resultado:',
        },
        // Composed at the call site as "<progressPrefix> 3 <progressOf> 30",
        // same convention as `present.progressPrefix`/`present.ofLabel`.
        progressPrefix: 'Pregunta',
        progressOf: 'de',
        next: 'Siguiente',
        // Counts as wrong (reduces guessing) — never shown as a hint.
        dontKnow: 'No lo sé',
        result: {
          title: '¡Listo!',
          estimatedLabel: 'Tu nivel estimado',
          estimatedNone: 'Todavía no alcanzas el nivel A1',
          recommendedLabel: 'Nivel recomendado para practicar',
          recommendedAboveB2: 'B2 o superior',
          breakdownTitle: 'Resultado por nivel',
          retry: 'Repetir el test',
          practiceCta: 'Practicar este nivel',
        },
      },
    },
  },
  en: {
    meta: {
      siteDescription:
        'ChuyoCode: English and technology in your language. Interactive activities for teachers and students, plus programming books and news for the Latin community.',
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
    footer: {
      terms: 'Terms & Conditions',
      privacy: 'Privacy',
      premium: 'Premium',
    },
    common: {
      back: 'Back',
      backTooltip: 'Back to the previous page',
      scrollToTop: 'Back to top',
      toast: {
        linkCopied: 'Link copied',
        submittedForReview: 'Submitted for review',
        activityDuplicated: 'Activity duplicated',
        reportSent: 'Report sent',
        autosaveError: 'Could not save automatically',
      },
    },
    admin: {
      ui: {
        pageTitle: 'Design system',
        pageDescription: 'Internal reference for the design system controls, buttons and cards.',
      },
      cursos: {
        pageTitle: 'Courses',
        pageDescription: 'Create and manage the site courses.',
        empty: 'No courses yet.',
        createTitle: 'New course',
        createButton: 'Create course',
        creating: 'Creating…',
        fields: {
          slug: 'Slug (URL)',
          title: 'Title',
          subtitle: 'Subtitle',
          description: 'Description',
          level: 'Level',
          includedInPremium: 'Included in Premium',
          priceCents: 'Individual purchase price (USD)',
        },
        status: {
          draft: 'Draft',
          published: 'Published',
          archived: 'Archived',
        },
        actions: {
          publish: 'Publish',
          archive: 'Archive',
          unpublish: 'Back to draft',
          save: 'Save changes',
          saving: 'Saving…',
        },
        editTitle: 'Edit course',
        detailsTitle: 'Course details',
        accessTitle: 'Grant access',
        accessDescription: 'Grant lifetime access to this course to a user, by email.',
        grantEmailLabel: 'User email',
        grantButton: 'Grant access',
        granting: 'Granting…',
        ownersTitle: 'Has access',
        ownersEmpty: 'Nobody has individual access yet.',
        revoke: 'Revoke',
        revoking: 'Revoking…',
        source: {
          purchase: 'Purchase',
          grant: 'Granted',
          promo: 'Promo',
        },
        errors: {
          invalid_slug: 'The slug must be lowercase letters, numbers and hyphens (no spaces).',
          invalid_title: 'Title is required (120 characters max).',
          invalid_subtitle: 'Subtitle cannot exceed 200 characters.',
          invalid_level: 'Invalid level.',
          invalid_price: 'Price cannot be negative.',
          duplicate_slug: 'A course with that slug already exists.',
          invalid_status: 'Invalid status.',
          user_not_found: 'No user found with that email.',
          already_owned: 'That user already has access to this course.',
          unavailable: 'The service is unavailable right now.',
          db_error: 'Something went wrong. Please try again.',
          bad_request: 'Invalid request.',
          invalid_duration: 'Duration must be a number greater than zero.',
          invalid_kind: 'Invalid lesson kind.',
          invalid_content: 'This lesson content is not valid for its kind.',
          activity_not_live: 'That activity is not published yet.',
          invalid_order: 'Could not reorder. Please try again.',
        },
        modules: {
          title: 'Modules',
          empty: 'This course has no modules yet.',
          addLabel: 'New module',
          addPlaceholder: 'Module title',
          addButton: 'Add module',
          adding: 'Adding…',
          rename: 'Rename',
          renaming: 'Renaming…',
          renamePlaceholder: 'New module title',
          save: 'Save',
          cancel: 'Cancel',
          delete: 'Delete module',
          deleting: 'Deleting…',
          confirmDelete: 'Delete this module? All its lessons are deleted too.',
          moveUp: 'Move module up',
          moveDown: 'Move module down',
        },
        lessons: {
          empty: 'This module has no lessons yet.',
          addButton: 'Add lesson',
          adding: 'Adding…',
          edit: 'Edit',
          save: 'Save',
          cancel: 'Cancel',
          delete: 'Delete',
          deleting: 'Deleting…',
          confirmDelete: 'Delete this lesson?',
          moveUp: 'Move lesson up',
          moveDown: 'Move lesson down',
          previewTag: 'Preview',
          fields: {
            title: 'Title',
            kind: 'Kind',
            kindText: 'Text',
            kindVideo: 'Video',
            kindActivity: 'Activity',
            markdown: 'Content (Markdown)',
            markdownPreview: 'Preview',
            videoUrl: 'Video URL',
            videoUrlHint: 'YouTube or Vimeo only, with https.',
            activitySearch: 'Search a published activity',
            activitySearchPlaceholder: 'Type a title…',
            activitySearching: 'Searching…',
            activityNone: 'No activities found.',
            activitySelected: 'Selected activity',
            activityChange: 'Change',
            duration: 'Duration (minutes)',
            isPreview: 'Free preview (no paid access required)',
          },
        },
      },
    },
    legal: {
      titles: {
        terms: 'Terms and conditions',
        privacy: 'Privacy policy',
        reembolsos: 'Refund policy',
      },
      pending: 'Legal content pending',
      privacyNote:
        'We respect your privacy. We are still drafting the full version of this document; in the meantime, we do not sell or share your personal data with third parties.',
    },
    // Credits page (`/[lang]/creditos`, visual-identity decision, 2026-10-04).
    // The actual license body copy lives in `CreditsContent.astro` (same
    // pattern as `legal` above: long-form text stays out of this map).
    credits: {
      pageTitle: 'Credits',
      pageDescription:
        'Credits and licenses for the third-party resources ChuyoCode uses.',
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
      // Window-manager architecture, robustness pass — see the Spanish
      // string's own comment.
      windowRedirecting: 'Your session expired. Taking you to sign in…',
      windowRedirectingContinue: 'Continue',
      nuevaClave: {
        title: 'New password',
        description: 'Choose a new password for the account.',
      },
      consent: {
        pageTitle: 'Confirm your age',
        pageDescription: 'Before continuing, confirm the following.',
        sentence:
          "I am 14 years old or older, or I have the consent of my father, mother or guardian. I accept the {terms} and the {privacy}.",
        termsLinkText: 'Terms',
        privacyLinkText: 'Privacy Policy',
        checkboxHint: 'Check the box to continue.',
        continue: 'Continue',
        continuing: 'Continuing…',
        genericError: 'Could not complete the request. Try again.',
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
        profile: 'Profile',
        signOut: 'Sign out',
        deleteAccount: 'Delete my account',
        deleteAccountDialogTitle: 'Delete your account',
        deleteAccountDialogBody:
          'Your published activities will stay available to the community under the ChuyoCode name. Your drafts, hearts and account data will be deleted. This action cannot be undone.',
        deleteAccountConfirmLabel: 'Type DELETE to confirm',
        deleteAccountConfirmWord: 'DELETE',
        deleteAccountCancel: 'Cancel',
        deleteAccountButton: 'Delete my account',
        deleteAccountSuccessToast: 'Your account was deleted.',
        deleteAccountErrorGeneric: 'Could not delete your account. Try again.',
      },
    },
    profile: {
      pageTitle: 'Profile',
      pageDescription: 'Manage your name, password and account.',
      nameSectionTitle: 'Name',
      nameLabel: 'Display name',
      nameSaveButton: 'Save',
      nameSaving: 'Saving…',
      nameSuccessToast: 'Your name was updated.',
      nameErrorGeneric: 'Could not update your name. Try again.',
      nameErrorInvalid: 'Enter a valid name (1 to 60 characters, no control characters).',
      emailSectionTitle: 'Email',
      emailReadOnlyNote: 'Changing your email needs a verification step first — not available yet.',
      passwordSectionTitle: 'Password',
      currentPasswordLabel: 'Current password',
      newPasswordLabel: 'New password',
      confirmNewPasswordLabel: 'Confirm new password',
      passwordSaveButton: 'Change password',
      passwordSaving: 'Changing…',
      passwordSuccessToast: 'Your password was updated.',
      passwordErrorGeneric: 'Could not change your password. Try again.',
      passwordErrorInvalidCurrent: 'Your current password is incorrect.',
      passwordErrorMismatch: 'The new passwords do not match.',
      passwordErrorTooShort: 'Use at least 8 characters.',
      passwordErrorReauthRequired: 'For your security, sign in again and retry.',
      passwordErrorSamePassword: 'Your new password must be different from the current one.',
      passwordErrorCaptchaFailed: "We couldn't verify you're human. Please try again.",
      passwordCaptchaPending: 'Waiting for verification…',
      passwordGoogleOnlyNote: 'You signed in with Google, so there is no password to change here.',
      planSectionTitle: 'Plan',
      planUpgradeLink: 'Discover Premium',
      dangerZoneTitle: 'Danger zone',
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
          description: 'Upload a worksheet or a PDF and mark where the answers go.',
        },
        questions: {
          title: 'Basic',
          description: 'Write questions and play them many ways.',
        },
        match: {
          title: 'Match the pairs',
          description: 'Drag each answer next to its partner.',
        },
        reorder: {
          title: 'Reorder',
          description: 'Drag the words to put the sentence in order.',
        },
        cloze: {
          title: 'Complete the sentence',
          description: 'Drag the words into the sentence\'s blanks.',
        },
        groupsort: {
          title: 'Group sort',
          description: 'Drag each item into its correct group.',
        },
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
        blocksEmptyChooseNext: 'Choose what to continue with',
        addBlock: 'Add block',
        moveUp: 'Move block up',
        moveDown: 'Move block down',
        dragHandle: 'Reorder',
        deleteBlock: 'Delete block',
        deleteConfirmTitle: 'Delete this block?',
        deleteConfirmBody: 'This cannot be undone.',
        deleteConfirmCancel: 'Cancel',
        deleteConfirmAccept: 'Delete',
        changeImage: 'Change image',
        changeImageConfirmTitle: 'Change this sheet’s image?',
        changeImageConfirmBody: 'The zones drawn on the current image will be lost.',
        changeImageConfirmAccept: 'Change',
        worksheetLabel: 'Worksheet',
        quizLabel: 'Basic',
        // Creator polish round 2.
        blockNameLabel: 'Block name',
        blockNamePlaceholder: 'Block name',
        blockDefaultNamePrefix: 'Sheet',
        zoneCountOne: 'zone',
        zoneCountMany: 'zones',
        questionCountOne: 'question',
        questionCountMany: 'questions',
        rotateLeft: 'Rotate left',
        rotateRight: 'Rotate right',
        blockIndex: 'Go to a block',
        blockIndexTitle: 'Blocks',
        sheetPrevious: 'Previous sheet',
        sheetNext: 'Next sheet',
        sheetPosition: (current: number, total: number) => `${current} of ${total}`,
        sheetMoreActions: 'More actions',
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
        undockToolbar: 'Release and float',
        savingStatus: 'Saving changes',
        savedStatus: 'Changes saved',
        errorStatus: 'Could not save',
        saveErrorRetry: "Couldn't save, retry",
        incompleteNoImage: "This worksheet doesn't have an image yet. Upload a file before submitting it.",
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
        basedOnPrefix: 'Based on "',
        basedOnSuffix: '" from the community',
        viewAsPresentation: 'View as presentation',
        submitForReview: 'Submit for review',
        submitDialogTitle: 'Submit this activity for review',
        submitDialogNote: 'A moderator will review your activity before it is published.',
        projectionWarningsHeading: 'Before you project',
        projectionWarningQuizPromptTooLong: 'This question is too long to project well; try shortening it.',
        projectionWarningWorksheetZoneTooSmall: 'This zone is too small to project well; make it bigger.',
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
        windowClose: 'Close',
        windowMinimize: 'Minimize',
        windowFullScreen: 'Full screen',
        titleFallback: 'New activity',
        titlebarSaving: 'Saving…',
        titlebarSaved: 'Saved a moment ago',
      },
      worksheet: {
        uploadTitle: 'Drag your worksheet or PDF here',
        uploadHint: 'JPG, PNG, WEBP or PDF. Maximum size: 2 MB per image.',
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
        taskPreparingPdf: 'Preparing the PDF…',
        taskConvertingPage: 'Converting page',
        taskUploadingPage: 'Uploading page',
        taskOptimizingImage: 'Optimizing image',
        taskUploadingImage: 'Uploading',
        taskOf: 'of',
        taskCancel: 'Cancel',
        taskRetry: 'Retry',
        taskChooseAnother: 'Choose another file',
        taskCombiningPages: 'Combining pages…',
        stitchTooManyPages: 'You can combine up to 5 pages or images into one sheet; the first 5 will be used.',
        errors: {
          unsupported_media_type: 'That file type is not supported.',
          empty_body: 'The file is empty.',
          payload_too_large: 'The file is too large.',
          not_webp: 'The image could not be processed.',
          invalid_dimensions: 'The image must be between 200 and 2400 pixels on a side.',
          upload_limit_reached: 'The upload limit was reached.',
          upload_failed: 'Could not upload the file. Try again.',
          pdf_failed: 'Could not process the PDF.',
          stitch_too_large: 'The combined sheet is too large to upload. Try fewer pages or smaller images.',
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
        zoneExplanationLabel: 'Why? (explanation)',
        zoneExplanationPlaceholder: 'Optional explanation',
        zoneExplanationHint: 'Shown to the learner if they get it wrong',
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
        explanationButtonLabel: 'See explanation',
        explanationHeading: 'Why?',
      },
      gameModes: {
        modeQuiz: 'Basic',
        modeCards: 'Cards',
        modeMatch: 'Match',
        modeReorder: 'Reorder',
        gradesQuizModeHint: 'Check grades the "Basic" mode.',
        cardFlipHint: 'Tap or press Space to flip',
        cardPrev: 'Previous',
        cardNext: 'Next',
        cardShuffle: 'Shuffle',
        cardKnewIt: 'I knew it',
        cardReviewIt: 'Review',
        cardReviewPileTitle: 'To review',
        cardReplayReview: 'Review again',
        cardsDone: 'Done! You reviewed every card.',
        matchReset: 'Reset',
        matchCheck: 'Check',
        matchRetry: 'Try again',
        matchResultOf: 'of',
        matchResultCorrect: 'correct',
        matchRemovePrefix: 'Remove tile',
        matchEmptySlot: 'Empty slot',
        matchTrayLabel: 'Available tiles',
        matchSoundMute: 'Mute sound',
        matchSoundUnmute: 'Unmute sound',
        reorderCheck: 'Check',
        reorderRetry: 'Try again',
        reorderResultOf: 'of',
        reorderResultCorrect: 'correct',
        reorderSoundMute: 'Mute sound',
        reorderSoundUnmute: 'Unmute sound',
        reorderPrev: 'Previous sentence',
        reorderNext: 'Next sentence',
        reorderSentenceOf: 'of',
        reorderTrayLabel: 'Available words',
        reorderLineLabel: 'Sentence',
        reorderLineEmpty: 'Tap or drag a word to start',
        reorderRemovePrefix: 'Remove word',
        modeSpeak: 'Speaking cards',
        speakDeal: 'Deal',
        speakNext: 'Next card',
        speakReveal: 'Show answer',
        speakCounterPrefix: 'Card',
        speakCounterOf: 'of',
        speakReshuffle: 'Shuffle again',
        modeWheel: 'Wheel',
        wheelSpin: 'Spin',
        wheelSpinning: 'Spinning…',
        wheelReveal: 'Show answer',
        wheelRemoveOnExit: 'Remove on landing',
        wheelExhausted: 'No items left on the wheel.',
        wheelLandedPrefix: 'The wheel landed on:',
        modeAnagram: 'Anagram',
        anagramCounterPrefix: 'Word',
        anagramCounterOf: 'of',
        anagramBackspace: 'Undo',
        anagramNext: 'Next word',
        anagramCorrectMessage: 'Correct!',
        anagramWrongMessage: 'Try again.',
        anagramDone: 'Done! You solved every anagram.',
        anagramPlayAgain: 'Play again',
        modeHangman: 'Hangman',
        hangmanCounterPrefix: 'Word',
        hangmanCounterOf: 'of',
        hangmanLivesLabel: 'Lives',
        hangmanWon: 'You got it!',
        hangmanLost: 'Out of tries.',
        hangmanNext: 'Next word',
        hangmanDone: 'Done! You played every word.',
        hangmanPlayAgain: 'Play again',
        modeTrueFalse: 'True or false',
        tfTrue: 'True',
        tfFalse: 'False',
        tfCounterPrefix: 'Statement',
        tfCounterOf: 'of',
        tfCorrect: 'Correct',
        tfWrong: 'Incorrect',
        tfScorePrefix: 'Score',
        tfPlayAgain: 'Play again',
        modeOpenBox: 'Open the box',
        openboxHint: 'Tap a box to open it.',
        openboxReveal: 'Show answer',
        openboxBoxAriaPrefix: 'Box',
        openboxOpenedSuffix: 'opened',
        openboxClosedSuffix: 'closed',
        modeCloze: 'Complete the sentence',
        clozeCheck: 'Check',
        clozeRetry: 'Retry',
        clozeResultOf: 'of',
        clozeResultCorrect: 'correct',
        clozeSoundMute: 'Mute sound',
        clozeSoundUnmute: 'Unmute sound',
        clozePrev: 'Previous sentence',
        clozeNext: 'Next sentence',
        clozeSentenceOf: 'of',
        clozeTrayLabel: 'Available words',
        clozeBlankEmpty: 'Empty slot',
        clozeRemovePrefix: 'Remove word',
        // Group sort (Wordwall "Group sort"): every item shuffled into a
        // tray, the groups shown as large boxes to drag each item into.
        // "Check" grades the whole board at once.
        modeGroupSort: 'Group sort',
        groupSortCheck: 'Check',
        groupSortRetry: 'Retry',
        // "9 of 9 correctly sorted" — composed around the learner's score.
        groupSortResultOf: 'of',
        groupSortResultCorrect: 'correctly sorted',
        groupSortSoundMute: 'Mute sound',
        groupSortSoundUnmute: 'Unmute sound',
        groupSortTrayLabel: 'Available items',
        groupSortEmptyGroup: 'Empty group',
        groupSortRemovePrefix: 'Remove item',
      },
      practice: {
        pageDescription: 'Practise this English activity: worksheets and questions with instant feedback.',
        back: 'Back to activities',
        noLevel: 'No level',
        print: 'Print',
        present: 'Present',
        check: 'Check',
        retry: 'Try again',
        score: 'Score',
        viewedFirstTime: 'First time',
        viewedBefore: "You've seen this",
        viewedTimesMany: 'times',
        viewsOne: 'view',
        viewsMany: 'views',
        heartAdd: 'Heart',
        heartRemove: 'Remove heart',
        heartsOne: 'heart',
        heartsMany: 'hearts',
        duplicate: 'Duplicate',
        duplicating: 'Duplicating…',
        duplicateErrors: {
          not_found: 'This activity is no longer available.',
          daily_limit: 'The daily duplicate limit was reached. Try again tomorrow.',
          upload_limit: "There isn't enough room to copy this activity's images. Free up some space before duplicating.",
          copy_failed: 'Could not duplicate the activity. Try again.',
          create_failed: 'Could not duplicate the activity. Try again.',
        },
        basedOnPrefix: 'Based on "',
        basedOnSuffix: '" from the community',
        share: 'Share',
        shareTitle: 'Share this activity',
        shareHint: 'Scan the code to open this activity on another device.',
        shareLink: 'Link',
        shareCopy: 'Copy',
        shareCopied: 'Copied',
        shareQrAlt: 'QR code linking to this activity',
        shareWhatsapp: 'WhatsApp',
        shareDownloadQr: 'Download QR',
        shareNative: 'More options',
        guestBanner: "You're playing as a guest. Create a free account to give hearts and make your own activities.",
        guestSignUp: 'Sign up',
        windowClose: 'Close',
        windowMinimize: 'Minimize',
        windowFullScreen: 'Full screen',
        windowMore: 'More',
        // "Focus mode" (full-screen exercise mode) — see the `es` copy's own
        // comment for why this is deliberately NOT named "Full screen" like
        // `windowFullScreen` above (a different, already-shipped control).
        focusMode: 'Focus mode',
        focusModeExit: 'Exit focus mode',
        focusModePrev: 'Previous page',
        focusModeNext: 'Next page',
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
        share: 'Share',
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
        typeQuiz: 'Basic',
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
        windowClose: 'Close',
        windowMinimize: 'Minimize',
        windowFullScreen: 'Full screen',
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
        clozeDistractorsLabel: 'Distractors',
        explanationLabel: 'Explanation',
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
      print: {
        pageDescription: 'Print-friendly version of this English activity.',
        noLevel: 'No level',
        print: 'Print',
        includeAnswers: 'Include answers',
        choicesLabel: 'Options',
        answersHeading: 'Answer key',
        explanationLabel: 'Why',
        worksheetLabel: 'Worksheet',
        quizLabel: 'Basic',
        matchLabel: 'Match the pairs',
        reorderLabel: 'Reorder',
        clozeLabel: 'Complete the sentence',
        clozeBankLabel: 'Word bank',
        groupSortLabel: 'Group sort',
        groupSortItemsLabel: 'Items',
      },
      present: {
        pageDescription: 'Full-screen presentation of this English activity, made for projecting in class.',
        noLevel: 'No level',
        questionsCountOne: 'question',
        questionsCountMany: 'questions',
        worksheetCountOne: 'sheet',
        worksheetCountMany: 'sheets',
        scanHint: 'Scan the code to open this activity on a phone.',
        qrAlt: 'QR code to open this activity on a phone',
        showQr: 'Show QR',
        hideQr: 'Hide QR',
        summaryTitle: 'All done!',
        restart: 'Start over',
        prev: 'Previous',
        next: 'Next',
        reveal: 'Show answer',
        fullscreenEnter: 'Full screen',
        fullscreenExit: 'Exit full screen',
        exit: 'Exit',
        progressPrefix: 'Slide',
        ofLabel: 'of',
        correctBadge: 'Correct',
        answerLabel: 'Answer',
        explanationLabel: 'Why',
        zoneLabel: 'Zone',
        liveCover: 'Cover',
        liveSummary: 'Summary',
        liveRevealed: 'Answer revealed',
        liveWorksheetOverview: 'Worksheet overview',
        matchTitle: 'Match the pairs',
        reorderTitle: 'Reorder',
        clozeTitle: 'Complete the sentence',
        groupSortTitle: 'Group sort',
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
      // Mirrors `es.home.ingles` — see its comment there.
      ingles: {
        label: 'English · Inglés',
        title: 'Learn and teach English through play',
        intro: 'Interactive activities to teach and practice English, explained in Spanish.',
        teachersCta: 'Create my activity',
        learnersCta: 'Explore activities',
        note: 'Creating and playing is free.',
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
      catalog: {
        pageTitle: 'Courses',
        pageDescription: 'Programming courses catalog.',
        empty: 'No published courses yet.',
        premiumBadge: 'Included in Premium',
        lifetimeBadge: 'lifetime',
        lessonSingular: 'lesson',
        lessonsPlural: 'lessons',
      },
      landing: {
        levelLabel: 'Level',
        syllabusTitle: 'Course content',
        lessonKind: { text: 'Text', video: 'Video', activity: 'Activity' },
        previewTag: 'Preview',
        lockedLabel: 'Locked',
        durationSuffix: 'min',
        ctaContinue: 'Continue',
        ctaStart: 'Start',
        ctaPremium: 'Go Premium',
        ctaBuyLifetime: 'Buy for life',
        paymentsSoon: 'Payments coming soon',
        moderatorPreviewNotice: 'Moderator preview: this course is not published.',
      },
      player: {
        sidebarToggle: 'Course content',
        prevLesson: 'Previous',
        nextLesson: 'Next',
        lockedTitle: 'This lesson is paid content',
        lockedBody: 'Go Premium or buy this course for life to watch it.',
        activityUnavailable: 'This activity is no longer available.',
      },
    },
    // Mirrors `es.premium` — see its comment there.
    premium: {
      label: 'Premium',
      title: 'Premium from US$1 a month',
      intro:
        'One membership to carry your progress, your level, and your private activities everywhere. While we finish wiring up payments, everything you have today stays free.',
      priceDisclaimer: 'Prices in US dollars (US$). Taxes may apply in your country.',
      comingSoon: 'Coming soon',
      recommendedBadge: 'Recommended',
      plans: {
        free: {
          name: 'Free',
          price: 'US$0',
          note: 'Forever.',
          cta: 'Start for free',
        },
        annual: {
          name: 'Annual',
          price: 'US$12/year',
          note: 'That is US$1 a month.',
        },
        monthly: {
          name: 'Monthly',
          price: 'US$2.99/month',
          note: 'Pay month to month.',
        },
      },
      founderNote: 'Founder price: US$9.99 a year, for life, for the first 200 subscribers.',
      comparison: {
        heading: 'Free vs. Premium',
        featureHeader: "What's included",
        freeHeader: 'Free',
        premiumHeader: 'Premium',
        rows: [
          { feature: 'Create activities', free: 'Yes, no limit for now', premium: 'Yes' },
          { feature: 'All game modes', free: 'Yes', premium: 'Yes' },
          { feature: 'Presentation mode', free: 'Yes', premium: 'Yes' },
          { feature: 'Share by link, QR, or WhatsApp', free: 'Yes', premium: 'Yes' },
          { feature: 'Print', free: 'Yes', premium: 'No watermark (coming soon)' },
          { feature: 'Guest play for your students', free: 'Yes', premium: 'Yes' },
          { feature: 'Curated exercises with Why? explanations', free: 'Yes', premium: 'Yes' },
          { feature: 'Progress saved on this device', free: 'Coming soon', premium: 'Coming soon' },
          { feature: 'Synced progress and mistake review', free: '—', premium: 'Coming soon' },
          { feature: 'CEFR level estimate with a verifiable certificate', free: '—', premium: 'Coming soon' },
          { feature: 'Private activities and collections by unit', free: '—', premium: 'Coming soon' },
          { feature: 'Class reports', free: '—', premium: 'Coming soon' },
          { feature: 'Natural voices', free: '—', premium: 'Coming soon' },
          { feature: 'AI speaking practice (with a monthly cap)', free: '—', premium: 'Coming soon' },
          { feature: 'Courses included', free: '—', premium: 'Coming soon' },
        ],
      },
      faq: {
        heading: 'Frequently asked questions',
        items: [
          {
            q: 'When can I pay?',
            a: "We're still activating payments. As soon as they're ready, you'll be able to subscribe right from this page.",
            link: null,
          },
          {
            q: 'Can I cancel anytime?',
            a: "Yes, you'll be able to cancel anytime, with no minimum commitment.",
            link: null,
          },
          {
            // Mirrors `es.premium.faq.items` — see its comment there.
            q: 'Is there a refund?',
            a: 'Yes: you have 14 days from your first payment (or from a renewal, if you did not use Premium after it) to request a full refund. Read the details in our',
            link: { href: '/legal/reembolsos', label: 'refund policy' },
          },
          {
            q: 'What happens to my activities if I do not pay?',
            a: 'They stay yours and free. Free has no expiration date.',
            link: null,
          },
        ],
      },
    },
    english: {
      hub: {
        title: 'English exercises',
        subtitle: 'Choose what you want to do today',
        description:
          'Practise English with community activities for every level.',
        communityTitle: 'Community activities',
        communityDescription: 'Activities created by other users.',
        activityCountOne: 'activity',
        activityCountMany: 'activities',
        todayTitle: 'For you today',
        weeklyPickLabel: 'Most loved this week',
        levelShortcutTitle: 'Jump to your level',
        trayLabel: 'Minimized windows',
        trayRemoveLabel: 'Remove from tray',
        trayMoreLabel: 'See {n} more windows',
        maxWindowsNotice: 'You already have a lot of windows open. Close one to open another.',
        backToChuyoCode: 'Back to ChuyoCode',
        greetingNamed: 'Hi, {name}.',
        greetingFallback: 'Hi.',
        greetingQuestion: 'What shall we practise today?',
        greetingSubtitle: 'Open a folder to pick an exercise, or jump straight to your level.',
        foldersLabel: 'Folders',
        widgetsLabel: 'Your desktop',
        weatherLabel: 'Weather in {city}',
        weatherUnavailable: 'Weather not available',
        weatherAttribution: 'Data: MET Norway',
        playerTitle: 'Phrase of the day',
        playerPrev: 'Previous',
        playerNext: 'Next',
        playerPlay: 'Listen',
        playerPause: 'Pause',
        playerUnavailable: 'Audio not available on this device',
        arrangeDesktop: 'Arrange desktop',
        helperLandmarkLabel: 'Help',
        helperAvatarLabel: 'Help from {name}',
        helperOtherTip: 'Another tip',
        helperClose: 'Close help',
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
      placement: {
        pageTitle: 'English level test',
        pageDescription:
          'A multiple-choice test to find your approximate English level, from A1 to B2.',
        intro: {
          title: 'English level test',
          description:
            'Answer 30 multiple-choice questions to find your approximate level, from A1 to B2. No time limit.',
          start: 'Start the test',
          lastResultPrefix: 'Your last result:',
        },
        progressPrefix: 'Question',
        progressOf: 'of',
        next: 'Next',
        dontKnow: "I don't know",
        result: {
          title: 'Done!',
          estimatedLabel: 'Your estimated level',
          estimatedNone: "You haven't reached A1 yet",
          recommendedLabel: 'Recommended level to practise',
          recommendedAboveB2: 'B2 or higher',
          breakdownTitle: 'Result by level',
          retry: 'Retake the test',
          practiceCta: 'Practise this level',
        },
      },
    },
  },
} as const satisfies Record<Lang, unknown>;


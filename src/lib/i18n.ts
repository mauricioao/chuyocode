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
        signIn: 'Entrar',
        accountMenu: 'Cuenta',
        planFree: 'Free',
        planPremium: 'Premium',
        // Links to the activities creator start screen (`/[lang]/crear`,
        // PR B). Local here, not to `activities.*`, for the same reason as
        // the rest of this map: it is chrome for the header's identity
        // chip, not copy owned by the creator pages themselves.
        createActivity: 'Crear actividad',
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
        unloadWarning: 'Hay cambios sin guardar. Van a perderse si se cierra la página.',
        blocksEmpty: 'Todavía no hay bloques. Agregar el primero para empezar.',
        addBlock: 'Agregar bloque',
        moveUp: 'Subir bloque',
        moveDown: 'Bajar bloque',
        deleteBlock: 'Eliminar bloque',
        deleteConfirmTitle: '¿Eliminar este bloque?',
        deleteConfirmBody: 'Esta acción no se puede deshacer.',
        deleteConfirmCancel: 'Cancelar',
        deleteConfirmAccept: 'Eliminar',
        worksheetLabel: 'Hoja de trabajo',
        quizLabel: 'Preguntas',
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
        zoneDelete: 'Eliminar zona',
        zoneMinOptions: 'Se necesitan al menos 2 opciones.',
        zoneAnswerNotInOptions: 'Cada respuesta debe estar entre las opciones.',
        noZonesYet: 'Todavía no hay zonas dibujadas sobre esta imagen.',
        panelEmpty: 'Dibujar un recuadro sobre la hoja o seleccionar uno para editarlo.',
        panelEmptyHint:
          'Atajos: flechas para mover una zona seleccionada, Suprimir para eliminarla, Ctrl/⌘ + rueda o los botones de abajo para hacer zoom.',
        zoomOut: 'Alejar',
        zoomIn: 'Acercar',
        zoomFit: 'Ajustar',
        zoomReset: '100%',
        zoomLevel: 'Nivel de zoom',
      },
      player: {
        notGraded: 'Vista previa: esta vista no corrige respuestas.',
        textPlaceholder: 'Escribir la respuesta',
        choicePlaceholder: 'Elegir una opción',
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
      // Copy for the section entry route `/[lang]/ingles` and the
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
        accountMenu: 'Account',
        planFree: 'Free',
        planPremium: 'Premium',
        createActivity: 'Create activity',
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
        unloadWarning: 'There are unsaved changes. They will be lost if this page is closed.',
        blocksEmpty: 'No blocks yet. Add the first one to get started.',
        addBlock: 'Add block',
        moveUp: 'Move block up',
        moveDown: 'Move block down',
        deleteBlock: 'Delete block',
        deleteConfirmTitle: 'Delete this block?',
        deleteConfirmBody: 'This cannot be undone.',
        deleteConfirmCancel: 'Cancel',
        deleteConfirmAccept: 'Delete',
        worksheetLabel: 'Worksheet',
        quizLabel: 'Questions',
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
        zoneDelete: 'Delete zone',
        zoneMinOptions: 'At least 2 options are needed.',
        zoneAnswerNotInOptions: 'Every answer must also be one of the options.',
        noZonesYet: 'No zones drawn on this image yet.',
        panelEmpty: 'Draw a box on the sheet or select one to edit it.',
        panelEmptyHint:
          'Shortcuts: arrow keys move a selected zone, Delete removes it, Ctrl/⌘ + wheel or the buttons below zoom.',
        zoomOut: 'Zoom out',
        zoomIn: 'Zoom in',
        zoomFit: 'Fit',
        zoomReset: '100%',
        zoomLevel: 'Zoom level',
      },
      player: {
        notGraded: 'Preview: this view does not grade answers.',
        textPlaceholder: 'Type the answer',
        choicePlaceholder: 'Choose an option',
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


/**
 * "The Village Inn" — the one complete, polished Aventura scene for the
 * hidden retro-RPG prototype (`/[lang]/ingles/aventura`, never linked).
 *
 * CEFR A1–A2, neutral Spanish translations (no voseo — guarded by
 * `villageInn.test.ts`, same rule as every other user-facing COPY map in
 * this codebase). Covers, once each, the seven grammar points the owner
 * asked for: greetings, "to be", present simple third person "-s",
 * "can"/"can't", "How much is/are…", the polite request "Could I…?", and
 * prepositions of place — plus four comprehension `choice`s along the way.
 *
 * Authored as a loosely-typed literal (not `satisfies Scene`) ON PURPOSE:
 * `parseSceneOrThrow` below is the actual source of truth for validity, so a
 * typo here fails the same way a bad JSON file would, not silently via TS
 * structural narrowing.
 */
import { parseSceneOrThrow, type Scene } from '@/lib/aventura/scene';

const narrator = { name: 'Narrator', sprite: 'narrator' };
const innkeeper = { name: 'Tom, the innkeeper', sprite: 'innkeeper' };
const merchant = { name: 'Merchant', sprite: 'merchant' };
const guard = { name: 'Guard', sprite: 'guard' };

const villageInnRaw = {
  id: 'village-inn',
  title: 'The Village Inn',
  background: 'inn',
  lines: [
    {
      id: 'l1',
      speaker: narrator,
      en: 'You arrive at the village after a long day of travel.',
      es: 'Llegas a la aldea después de un largo día de viaje.',
    },
    {
      id: 'l2',
      speaker: narrator,
      en: 'The Golden Lion Inn stands in front of you, with warm light in its windows.',
      es: 'La posada El León Dorado se alza frente a ti, con luz cálida en sus ventanas.',
    },
    {
      id: 'l3',
      speaker: innkeeper,
      en: 'Hello! Welcome to the Golden Lion Inn.',
      es: '¡Hola! Bienvenido a la posada El León Dorado.',
      grammar: {
        title: 'Saludos',
        note: '"Hello" es el saludo más común y neutro en inglés. Se usa a cualquier hora del día y con cualquier persona.',
      },
    },
    {
      id: 'l4',
      speaker: innkeeper,
      en: 'I am the innkeeper. My name is Tom.',
      es: 'Soy el posadero. Me llamo Tom.',
      grammar: {
        title: 'El verbo "to be"',
        note: '"I am" (yo soy/estoy) es la primera persona del verbo "to be" en presente. Se contrae como "I\'m".',
      },
      choice: {
        question_es: '¿Qué significa "I am the innkeeper"?',
        options: [
          { en: 'Soy el posadero', correct: true, feedback_es: '¡Correcto! "I am" significa "soy/estoy".' },
          {
            en: 'Eres el posadero',
            correct: false,
            feedback_es: 'No. Esa oración usa "you are" (tú eres), no "I am". Intenta de nuevo.',
          },
        ],
      },
    },
    {
      id: 'l5',
      speaker: narrator,
      en: 'You greet him back and ask for a room.',
      es: 'Le devuelves el saludo y pides una habitación.',
    },
    {
      id: 'l6',
      speaker: innkeeper,
      en: 'Of course! We have one room left for tonight.',
      es: '¡Claro! Nos queda una habitación para esta noche.',
    },
    {
      id: 'l7',
      speaker: narrator,
      en: 'You ask about the price.',
      es: 'Preguntas por el precio.',
    },
    {
      id: 'l8',
      speaker: innkeeper,
      en: "How much is a single room? It's ten gold coins a night.",
      es: '¿Cuánto cuesta una habitación individual? Son diez monedas de oro por noche.',
      grammar: {
        title: 'How much is / are…',
        note: 'Se usa "How much is" con sustantivos singulares o incontables, y "How much are" con sustantivos plurales, para preguntar precios.',
      },
    },
    {
      id: 'l9',
      speaker: narrator,
      en: 'You wonder how to ask about two rooms instead.',
      es: 'Te preguntas cómo pedir el precio de dos habitaciones.',
      choice: {
        question_es: '¿Cuál pregunta es correcta para preguntar el precio de VARIAS habitaciones?',
        options: [
          {
            en: 'How much is the rooms?',
            correct: false,
            feedback_es: 'No. Con sustantivos plurales se usa "are", no "is". Intenta de nuevo.',
          },
          {
            en: 'How much are the rooms?',
            correct: true,
            feedback_es: '¡Correcto! "Rooms" es plural, así que usamos "are".',
          },
        ],
      },
    },
    {
      id: 'l10',
      speaker: narrator,
      en: 'You have enough gold coins. You decide to stay.',
      es: 'Tienes suficientes monedas de oro. Decides quedarte.',
    },
    {
      id: 'l11',
      speaker: innkeeper,
      en: 'Could I have your name, please?',
      es: '¿Podría darme su nombre, por favor?',
      grammar: {
        title: 'Peticiones corteses: "Could I…?"',
        note: '"Could I…?" es una forma amable y formal de pedir algo o pedir permiso, más educada que "Can I…?".',
      },
    },
    {
      id: 'l12',
      speaker: narrator,
      en: 'You tell him your name, and he writes it in a big book.',
      es: 'Le dices tu nombre, y él lo escribe en un libro grande.',
    },
    {
      id: 'l13',
      speaker: innkeeper,
      en: 'Perfect. Your room is upstairs, next to the window.',
      es: 'Perfecto. Su habitación está arriba, al lado de la ventana.',
      grammar: {
        title: 'Preposiciones de lugar',
        note: '"Next to" (al lado de), "upstairs" (arriba) e "in front of" (frente a) son preposiciones y expresiones de lugar comunes en inglés.',
      },
      choice: {
        question_es: '¿Qué significa "next to the window"?',
        options: [
          { en: 'al lado de la ventana', correct: true, feedback_es: '¡Correcto!' },
          {
            en: 'debajo de la ventana',
            correct: false,
            feedback_es: 'No, "under" es "debajo de". Intenta de nuevo.',
          },
        ],
      },
    },
    {
      id: 'l14',
      speaker: narrator,
      en: 'You walk into the common room. A merchant is sitting by the fire.',
      es: 'Entras a la sala común. Un comerciante está sentado junto al fuego.',
    },
    {
      id: 'l15',
      speaker: merchant,
      en: 'Good evening, traveler! I sell potions and maps.',
      es: '¡Buenas noches, viajero! Vendo pociones y mapas.',
    },
    {
      id: 'l16',
      speaker: merchant,
      en: 'My brother sells swords. He works at the market.',
      es: 'Mi hermano vende espadas. Él trabaja en el mercado.',
      grammar: {
        title: 'Presente simple (tercera persona)',
        note: 'Con "he / she / it" el verbo en presente simple añade una "-s": "sell" → "sells", "work" → "works".',
      },
      choice: {
        question_es: '¿Cuál oración usa correctamente el presente simple en tercera persona?',
        options: [
          {
            en: 'She work at the market.',
            correct: false,
            feedback_es: 'No. Falta la "-s": "She works". Intenta de nuevo.',
          },
          {
            en: 'She works at the market.',
            correct: true,
            feedback_es: '¡Correcto! "Works" lleva "-s" porque el sujeto es "she".',
          },
        ],
      },
    },
    {
      id: 'l17',
      speaker: merchant,
      en: "I can sell you a map of the forest, but I can't sell weapons here.",
      es: 'Puedo venderte un mapa del bosque, pero no puedo vender armas aquí.',
      grammar: {
        title: "Can / can't",
        note: '"Can" expresa habilidad o posibilidad ("puedo/puede"); "can\'t" es su forma negativa ("no puedo/no puede"). No cambian con la persona: "he can", "she can\'t".',
      },
    },
    {
      id: 'l18',
      speaker: narrator,
      en: 'You thank the merchant and step outside for some fresh air.',
      es: 'Le agradeces al comerciante y sales a tomar aire fresco.',
    },
    {
      id: 'l19',
      speaker: guard,
      en: 'Good evening. The castle is north of here, past the market.',
      es: 'Buenas noches. El castillo está al norte de aquí, pasando el mercado.',
    },
    {
      id: 'l20',
      speaker: guard,
      en: "It's late. You should get some rest before your journey.",
      es: 'Es tarde. Deberías descansar antes de tu viaje.',
    },
    {
      id: 'l21',
      speaker: narrator,
      en: 'You go back inside and climb the stairs to your room.',
      es: 'Vuelves adentro y subes las escaleras hasta tu habitación.',
    },
    {
      id: 'l22',
      speaker: innkeeper,
      en: 'Good night, traveler. Sleep well!',
      es: '¡Buenas noches, viajero! Que duermas bien.',
    },
    {
      id: 'l23',
      speaker: narrator,
      en: 'You close the door and lie down in a warm, comfortable bed.',
      es: 'Cierras la puerta y te acuestas en una cama cálida y cómoda.',
    },
    {
      id: 'l24',
      speaker: narrator,
      en: 'Tomorrow, a new adventure begins.',
      es: 'Mañana comienza una nueva aventura.',
    },
  ],
};

export const villageInnScene: Scene = parseSceneOrThrow(villageInnRaw);

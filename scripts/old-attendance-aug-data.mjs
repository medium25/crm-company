// Транскрипт посещаемости из старой системы (icon.modme.uz), группа за
// группой, «All days» → август 2026. Собрано вручную через браузер.
// Формат: { code: { days: [1..31], students: { name: [status,...] } } }
// status: 'W' = Was, 'N' = Not, null = нет данных (не переносим).

export const OLD_ATTENDANCE = {
  I13: {
    days: [1,4,6,8,11,13,15,18,20,22,25,27,29],
    students: {
      "Azamat Ergashev":            [null,null,'W','W',null,'W','W','W','W','W','W','W','W'],
      "Mirjalol Hamidullayev":      [null,null,null,null,null,'W','N','W','W','N','N','N','W'],
      "Mohinur Abdug'afforova":     [null,null,'W','W',null,'W','W','W','W','W','N','W','W'],
      "Sora Baxtiyorova":           [null,null,'W','N',null,'N','W','W','W','N','W','W','W'],
      "Xadicha Bahtiyorova":        ['N','W','W','N',null,'N','W','W','W','N','W','W','W'],
    },
  },
  I14: {
    days: [1,4,6,8,11,13,15,18,20,22,25,27,29],
    students: {
      "Abbos Baxtiyev":             [null,'W','W','N','W','W','W','W','W','W','W','N','W'],
      "Abdulloh Hikmatullayev":     [null,'W','W','N','W','W','N','W','W','W','W','W','N'],
      "Abdurasulov Kamoliddin":     [null,null,null,null,null,null,null,null,null,null,'N','N','N'],
      "Jaloliddin Xasanov":         [null,'W','W','N','N','W','N','W','W','N','W','W','N'],
    },
  },
  I5: {
    days: [3,5,7,10,12,14,17,19,21,24,26,28,31],
    students: {
      "Feruza Zokirova":            ['W','W','W','W','W','W','W','N','W','W','W','N',null],
    },
  },
  I6: {
    days: [3,5,7,10,12,14,17,19,21,24,26,28,31],
    students: {
      "Maryam Mirsaidova":          ['W','W','W','W','W','W','N','W','N','W','W','W',null],
      "Mohir Ergashboyev":          [null,null,null,'N','N','N','N','N','N','N','N','N',null],
      "Mubina Muminova":            ['N','W','W','W','W','W','W','N','W','W','W','W',null],
      "Muslima Azamatova":          ['N',null,'N','N','N','N','N','N','N','N','N','N',null],
      "Saidabror G`aniyev":         ['N',null,'N','N','N','W','N','N','N','N','N','N',null],
      "Shaxnur Axmedov":            [null,'N','W','W','W','W','W','W','W','W','W','N',null],
      "Sobirjonov Muhammadali":     [null,null,'W','W','W','W','W','N','W','W','W','N',null],
    },
  },
  I7: {
    days: [3,5,7,10,12,14,17,19,21,24,26,28,31],
    students: {
      "Asqar Ilhamov":              [null,null,null,null,null,null,null,'W','W','W','W','N','N'],
      "Jobir Boboqulov":            [null,null,null,null,null,null,null,'W','W','W','W','N','N'],
      "Kamron Kenjayev":            ['N','W','W','W','N','W','W','N','W','W','N','W',null],
      "Mirazim Mirjalolov":         [null,null,'W','N','W','W','N','W','W','W','W','N',null],
      "Sanjar Akbarov":             [null,null,null,null,null,null,null,null,null,'W','W','W','W'],
    },
  },
  "MINI 1": {
    days: [3,5,7,10,12,14,17,19,21,24,26,28,31],
    students: {
      "Fayoz To'raqulov":           [null,'W','N','W','W','W','W','W','W','W','W','W',null],
      "Sitora Egamberdiyeva":       ['W',null,'W','W','W','N','N','N','W','W','W','W',null],
    },
  },
  "MINI 2": {
    days: [1,4,6,8,11,13,15,18,20,22,25,27,29],
    students: {
      "Umid Sa'dullayev":           ['N','N',null,'N','N','N','N','N','N','N','N','N',null],
      "Zuhriddin Qayimov":          ['W','W',null,'W','N','W','N','N','N','N','N','N',null],
    },
  },
  R11: {
    days: [1,4,6,8,11,13,15,18,20,22,25,27,29],
    students: {
      "Anvarxojayev Tohir":         [null,null,null,null,null,null,'W','W','W','W','N','N','N'],
      "Saidafzal Mirzayev":         ['W','W','W','N','W','W','N','N','W','W','W','W',null],
    },
  },
  R12: {
    days: [1,4,6,8,11,13,15,18,20,22,25,27,29],
    students: {
      "Amirbek Raximov":            [null,null,null,null,null,null,null,null,null,null,null,null,null],
      "Umar Faxriddinov":           ['W','W','W','W','W','N','W','N','W','W','W','W',null],
    },
  },
  R13: {
    days: [1,4,6,8,11,13,15,18,20,22,25,27,29],
    students: {
      "Abror":                      ['N','N','N','N','N','N','N','N','N','N','N','N',null],
      "Doniyor Sharifjonov":        [null,null,'W','W','N','W','W','N','N','W','W','N',null],
      "Fayzulloh Axrorov":          ['W','W','W','W','W','W','W','W','W','W','W','W',null],
      "Munisa Ammonova":            ['W','W','N','N','W','W','W','W','W','W','W','W',null],
      "Ruxsora Ibragimova":         ['W','W','W','W','W','W','W','W','W','W','W','W',null],
    },
  },
  R14: {
    days: [1,4,6,8,11,13,15,18,20,22,25,27,29],
    students: {
      "Bahodir Suyarov":            [null,null,null,null,null,null,'W','N','W','W','N','N','N'],
      "Fazliddin Sirojiddinov":     [null,null,null,null,null,null,null,null,'W','W','W','W','N'],
      "Said Abdurahmonov":          [null,null,null,null,null,null,null,'W','N','W','N','W','N'],
    },
  },
  R29: {
    days: [3,5,7,10,12,14,17,19,21,24,26,28,31],
    students: {
      "Abdullox Abdullaxatov":      [null,null,null,null,null,null,null,null,null,'W',null,'N','N'],
      "Bexruz Ganiyev":             ['W',null,'N','W','W','W','W','W','W','W','W','W',null],
      "Elbek Uchqunov":             ['W','W','W','W','W','W','W','W','N','N','W','W',null],
      "Erkinova Muhlisa":           ['W','W','W','W','W','W','W','W','W','W','W','W',null],
      "Sardor Toirov":              ['N','W','W','W','N','N','N','W','W','W','N','N',null],
      "Ziyoda Yo'ldosheva":         ['W','W','W','W','W','N','N','W','W','W','N','N',null],
      "Ziyodaxon Saidinabiyeva":    ['W','W','N','N','N','N','N','N','N','N','N','N',null],
    },
  },
  R30: {
    days: [3,5,7,10,12,14,17,19,21,24,26,28,31],
    students: {
      "Abdullox Abdullayev":        ['N','W','N','W','W','N','W','W','W','W','W','W',null],
      "Dilnoza Rihsiboyeva":        ['W','W','N','N','W','W','W','W','W','W','W','W',null],
      "Mohinur Mansurova":          ['N','W','W','W','W','W','W','W','W','W','W','W',null],
      "Mubina Maxkamova":           ['W','W','W','W','W','W','W','W','W','W','W','W',null],
      "Muhammad Xamidov":           ['W','W','W','N','W','W','N','N','N','N','N','N',null],
      "Sarvar Nuraliyev":           ['W','W','W','W','W','W','W','W','W','N','W','W',null],
      "Shahrizoda Xasanova":        ['W','N','W','N','W','W','N','W','W','W','W','N',null],
      "Zuhra Akmalova":             [null,null,'W','W','W','N','W','W','W','N','N','N',null],
    },
  },
  R31: {
    days: [3,5,7,10,12,14,17,19,21,24,26,28,31],
    students: {
      "Feruza Zokirova":            ['W','W','W','W','W','W','W','W','W','W','W','N',null],
      "Habiba To'xtasinova":        ['W','W','W','W','W','W','W','W','W','W','W','W',null],
    },
  },
  R32: {
    days: [3,5,7,10,12,14,17,19,21,24,26,28,31],
    students: {
      "Mahliyo Xasanova":           [null,'W','W','W','W','W','W','W','W','W','W','W',null],
      "Nasiba Usarova":             ['W','W','W','W','W','W','W','W','W','N','W','W',null],
    },
  },
  R33: {
    days: [3,5,7,10,12,14,17,19,21,24,26,28,31],
    students: {
      "Asila Ismoilova":            ['W','W','W','W','W','W','W','N','N',null,'N','W',null],
      "Javohir Tulanov":            ['N','W','W','W','W','N','W','W','W',null,'W','W',null],
      "Maftuna Fozilova":           ['N','W','W','W','W','N','W','W','W',null,'W','W',null],
      "Mubina Inogamova":           ['W','N','W','W','N','W','W','W','W',null,'W','W',null],
      "Muhammadsolix Abdurashidov": ['N','N','N','N','N','N','N','N','N',null,'N','N',null],
      "Nozima Maxkamova":           ['W','W','W','W','W','W','W','W','W',null,'W','W',null],
    },
  },
  R34: {
    days: [3,5,7,10,12,14,17,19,21,24,26,28,31],
    students: {
      "Marjona Ungboyeva":          ['W','W','W','W','W','N','N','N','N',null,'W','N',null],
      "Miraziz Ochilov":            [null,null,null,null,null,null,null,null,null,null,null,null,null],
      "Nodira Jumanazarova":        ['W','W','W','W','W','W','W','W','W',null,'W','N',null],
      "Odina Kamilova":             [null,null,null,'W','W','W','W','N','W',null,'W','N',null],
      "Roziya Murodova":            ['W','N','W','W','W','W','W','W','N',null,'N','N',null],
    },
  },
  R36: {
    days: [1,4,6,8,11,13,15,18,20,22,25,27,29],
    students: {
      "Elbek Sadriyev":             ['N','N','N','W','W','N','N','N','N',null,'N','N','N'],
      "Nodirxo'ja Muzaffarov":      ['W','W','W','N','W','N','W','W','W',null,'N','W','N'],
      "Sherzod Xidirov":            [null,null,'W','W','W','W','W','W','W',null,'W','W','W'],
      "Sultonova Komila":           ['W','W','N','N','W','W','N','W','N',null,'N','N','N'],
    },
  },
  R37: {
    days: [1,4,6,8,11,13,15,18,20,22,25,27,29],
    students: {
      "Ibrohim Ismoilov":           ['W','N','N','W','W','N','N','N','N',null,'N','N','N'],
      "Lobar Sayidahmadova":        [null,null,'W','W','W','N','N','W','W',null,'W','N','N'],
      "Muhammadiev Bekzod":         ['W','W','W','W','W','W','N',null,null,null,null,'W','W'],
      "O'lmasbek Yusupov":          [null,null,null,null,null,null,'W','N','N',null,'N','W','N'],
      "Safiya Najimova":            [null,null,null,'W','W',null,'W','N','W',null,'W','W','W'],
      "Yunus Hamdamov":             ['N','N','N','N','N','N','W','W','W',null,'N','W','W'],
      "Ziyayeva Madina":            ['W','W','W','W','W','N','W','N','N',null,'N','N','N'],
      "Zokirjon Shokirov":          ['W','W','W','N','W','W','W','W','W',null,'W','N','W'],
    },
  },
  R39: {
    days: [1,4,6,8,11,13,15,18,20,22,25,27,29],
    students: {
      "Alisher Qurbonov":           [null,null,null,null,null,null,null,null,null,null,'W','W','W'],
      "G'iyosiddin Sodiqov":        ['N','N','N','N','N','N','N','N','N','N','N','N','N'],
      "Muslima Murodova":           ['W','W','W',null,'W','W','W','W','W','W','W','W','W'],
      "Muslima Saidova":            ['W','W','W',null,'W','W','W','W','W','W','W','W','W'],
      "Sevinch Muxammadiyeva":      [null,null,null,null,'W','W','W','W','N','W','N',null,'W'],
      "Sojida Umarova":             ['W','W','N','W','W','W','W','W','W','W','W','W','W'],
    },
  },
  R4: {
    days: [3,5,7,10,12,14,17,19,21,24,26,28,31],
    students: {
      "Bilol Jo'rayev":             ['W','W','W','W','W','W','N','N','W','W','W','W',null],
      "Habibulloh Jo'rayev":        ['W',null,null,null,null,null,null,null,'W','W','W','W','W'],
      "Muhammadiso G'aniyev":       [null,'W','N','W','W','W','W','W','W','W','W','W',null],
      "Muqaddas Jo`rayeva":         ['N','N','N','N','N','N','N','N','N','N','N','N',null],
      "Shahriyor Kamoliddinov":     ['W','W','W','N','W','W','W','W','W','N','N','N',null],
      "Sunatillo Tugalov":          [null,null,null,null,null,null,null,null,null,'W','W','N','W'],
      "Zarnigor Abdushukurova":     [null,'W','N','W','W','N','N','W','W','W','N','N',null],
      "Zubayr Ahromov":             ['W','W','W','W','N','W','W','W','W','W','W','W',null],
    },
  },
  R40: {
    days: [1,4,6,8,11,13,15,18,20,22,25,27,29],
    students: {
      "Diyora Normamatova":         ['W','W','W','W','N','W','W','W','W','N','W','W','N'],
      "Lobar Tadjimirzayeva":       ['W','W','N','N','N','N','N','N','N','N','N','N','N'],
      "Ozodbek Rajabov":            ['W','N','N','N','N','N','W','W','W','W','W','N','N'],
      "Robiya Abdug'aniyeva":       [null,null,'W','W','W','W','W','W','N','W','W','W','W'],
    },
  },
  R41: {
    days: [1,4,6,8,11,13,15,18,20,22,25,27,29],
    students: {
      "Qudratjon Kabirjonov":       ['W','N','W','N','N','N','N','N','N','N','N','N','N'],
      "Sharifabonu Ahrorjonova":    ['W','W','W','W','W','W','N','W',null,'W','N','W','W'],
    },
  },
  R42: {
    days: [1,4,6,8,11,13,15,18,20,22,25,27,29],
    students: {
      "Komila Egamberdiyeva":       ['N','W','N','W','W','N','W','N','W','W','W',null,'N'],
      "Shohjaxon Erkinov":          ['W','W','W','W','W','W','W','W','W','W','W','N','N'],
    },
  },
  R5: {
    days: [3,5,7,10,12,14,17,19,21,24,26,28,31],
    students: {
      "Abduazim Axrorov":           ['W','W','W','W','W','N','W','W','W','W','W','W',null],
      "Asadbek Ergashev":           ['W','W','N','W','W','N','N','N','N','N','N','N',null],
      "Farzona Raxmatullayeva":     [null,null,null,null,null,null,null,null,'W','W','N','W',null],
      "Iroda Alimbekova":           ['W','W','W','W','W','N','W','N','N','W','W','W',null],
      "Jahongir Vositov":           ['W','W','W','W','W','W','W','W','W','W','W','W',null],
      "Madina Sharipova":           ['W','W','W','W','W','W','W','N','W','W','W','W',null],
      "Shahlo Sayfuddinova":        ['W','N','W','W','W','W','W','W','W','W','W','W',null],
      "Shahruza Muqumjonova":       ['W','W','W','W','W','W','W','N','N','W','N','N',null],
      "Soliha Xikmatova":           ['W','W','W','W','W','N','W','W','W','N','W','W',null],
    },
  },
  R6: {
    days: [3,5,7,10,12,14,17,19,21,24,26,28,31],
    students: {
      "Husan Turdumuhammedov":      [null,null,null,null,null,null,null,null,null,null,null,null,'W'],
      "Sarvinoz Muhammadkulova":    ['N','W','N','N','N','N','N','N','N','N','N','N',null],
    },
  },
  R7: {
    days: [3,5,7,10,12,14,17,19,21,24,26,28,31],
    students: {
      "Axmadxon Shuxratov":         ['W','W','W','W','W','W','N','W','W','W','N','W',null],
      "Hojiakbar Zuxriddinov":      ['W','W','W','W','W','W','W','W','W','W','W','W',null],
      "Mahsudali Voxobjonov":       ['W','W','W','W','W','W','W','W','W','W','W','W',null],
      "Roziya Bahodirova":          [null,null,null,null,null,null,null,null,null,'W','W','W','W'],
      "Shuxrat Ashurov":            [null,null,null,null,null,null,null,null,null,'W','W','N','N'],
    },
  },
};

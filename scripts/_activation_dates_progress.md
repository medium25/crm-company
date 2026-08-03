# Прогресс сбора реальных личных дат зачисления (Activated from) из modme

Задача: наш `students.createdAt` для большинства из исходных 146 студентов
(Phase 1) — это дата СТАРТА ГРУППЫ, не личная дата присоединения студента.
Из-за этого "Обучается" в новой CRM завышено (пример: Erkinova Muhlisa —
у нас с 10.03.2025, реально с 18.07.2026).

Источник данных: вкладка **History** на странице группы (`/groups/{id}` →
таб History) — там лог "Status changed / Activated from: YYYY-MM-DD" по
каждому студенту группы, один запрос вместо похода по 143 профилям.
Если история не долистывает до нужного студента (обрезается на старых
записях) — берём с его личного профиля (`Added at`/`Activated at` под
блоком его группы).

## ID всех 28 активных групп в modme (для повторного использования)

```
I12=145813  I13=148504  I14=146270  I5=145814   I6=157141   I7=145849
MINI 1=158332  MINI 2=159204
R11=147437  R12=147438  R13=147439  R14=147440
R29=130709  R30=134651  R31=158841  R32=158840
R33=158583  R34=153925  R36=157526  R37=154464
R39=121370  R4=147432   R40=122637  R41=124892
R42=129674  R5=147434   R6=147435   R7=147436
```

## Как открыть History конкретной группы (JS)

```js
document.querySelectorAll('a, [role="tab"]')
  .find(t => t.textContent.trim() === 'History').click();
```
Потом `get_page_text` (max_chars ~4000). Если студента группы не видно в
выдаче — открыть его профиль через поиск на /students (см. пример ниже)
и взять `Added at`/`Activated at` под блоком его текущей группы.

## Собрано (13 из 28 групп) — имя → дата зачисления (YYYY-MM-DD)

### I12
Azamat Ergashev: 2026-04-02
Foziljon Ozodov: 2026-07-04
Mohinur Abdug'afforova: 2026-06-16
Sora Baxtiyorova: 2026-06-16

### I13
Jasmina Tojiyeva: 2026-06-16
Mirazim Mirjalolov: 2026-04-27
Saida`zim Qudratrov: 2026-05-14
Sindor Allanazarov: 2026-07-02
Xadicha Bahtiyorova: 2026-07-04

### I14
Abbos Baxtiyev: 2026-06-16
Abdulloh Hikmatullayev: 2026-06-23
Jaloliddin Xasanov: 2026-07-16
Muhammadqodir Ravshanbekov: 2026-06-25
Oybek Shavkatov: 2026-02-12 (с профиля)
Sanjar Akbarov: 2026-04-25

### I5
Mohir Ergashboyev: 2026-05-01
Muhammadyusuf Akromov: 2026-06-22
Samira Mahkamova: 2026-05-01
Shaxnur Axmedov: 2026-04-03
Sobirjonov Muhammadali: 2026-06-01
Yusuf Rahmatullayev: 2026-06-03

### I6
Bunyodbek Mirzohidov: 2026-07-15
Diyorbek Radjapov: 2026-07-01
Maryam: 2026-06-29
Mubina Muminova: 2026-08-01
Muslima Azamatova: 2026-06-17
Muslima Jamalova: 2026-06-12
Muxsina Javalova: 2026-06-12
Saidabror G`aniyev: 2026-07-10

### I7
Fazliddin Lutfullayev: 2026-07-03
Kamron Kenjayev: 2026-06-16
Lazizbek Xusanboyev: 2026-05-13 (с профиля, Activated at)

### MINI 1
Ilhom Mirakbarov: 2026-07-14
Kamronbek Yunusov: 2026-07-15
Sitora Egamberdiyeva: 2026-07-08

### MINI 2
Umid Sa'dullayev: 2026-07-21
Zuhriddin Qayimov: 2026-07-31

### R11
Bahodir Aripov: 2026-01-17 (с профиля)
Lobar Mahmudova: 2026-05-05
Mubina Yaqubhajjayeva: 2026-01-13 (с профиля)
Muhammadiso G'aniyev: 2026-06-18
Saidafzal Mirzayev: 2026-04-28

### R12
Farzona Raxmatullayeva: 2026-07-02
Umar Faxriddinov: 2026-07-21

### R13
Abror: 2026-05-12 (с профиля, ещё Trial — не активирован)
Fayzulloh Axrorov: 2026-05-09
Maftuna Ixtiyarova: 2026-06-06
Munisa Ammonova: 2026-06-06
Ruxsora Ibragimova: 2026-07-16
Vasila Abdugaffarova: 2025-12-02 (с профиля, статус Frozen)

### R14
Baxrom Musulmonov: 2026-06-09
Muhammadsolih: 2026-06-11
Roziya Bahodirova: 2026-06-10
Shohjahon Axmatov: 2026-06-04
Shuxrat Ashurov: 2026-07-29
Tohir Toirjonov: 2026-06-18

### R29
Elbek Uchqunov: 2026-06-01 (с профиля)
Erkinova Muhlisa: 2026-07-22
O'lmasbek: 2026-07-20
Sardor Toirov: 2026-07-01
Ziyoda Yo'ldosheva: 2026-07-01
Ziyodaxon Saidinabiyeva: 2026-05-13 (с профиля)

### R30
Abdullox Abdullayev: 2026-07-10
Abduqodir Jo'raev: 2026-07-24
Dilnoza Rihsiboyeva: 2026-06-17
Maftuna Mohirjonova: 2026-06-01 (с профиля)
Mohinur Mansurova: 2026-07-06
Mubina Maxkamova: 2026-07-13
Muhammad Xamidov: 2026-07-13
Munisa Norboyeva: 2026-05-20 (с профиля)
Sarvar Nuraliyev: 2026-06-19
Shahrizoda Xasanova: 2026-07-20

### R31
Feruza Zokirova: 2026-07-13
Habiba To'xtasinova: 2026-07-13
Madina Abdukarimova: 2026-07-22

### R32
Asliddin G'apporov: 2026-07-13
Robiya Saidganiyeva: 2026-07-13
Shaxnoza Bafayeva: 2026-07-22

### R33
Abror Alijonov: 2026-07-07
Asila Ismoilova: 2026-07-08
Aydin Adilova: 2026-07-31
Izzatilla Mahmudov: 2026-07-13
Javohir Tulanov: 2026-07-09
Maftuna Fozilova: 2026-07-13
Mubina Inogamova: 2026-07-13
Muhammadsolix Abdurashidov: — (с профиля, статус Trial — не активирован)
Nozima Maxkamova: 2026-07-09
Otabek Jamilov: 2026-07-20

### R34
Asilbek Ro'ziboyev: 2026-07-06
Mohir Abdurauffov: 2026-05-13 (с профиля)
Nodira Jumanazarova: 2026-08-01
Roziya Murodova: 2026-07-13
Sarvinoz Mamurjonova: 2026-07-24
Uchqunbek Bomurodov: 2026-06-10 (с профиля, статус Frozen)

### R36
Bobur Sirojiddinov: 2026-07-01
Durdona Nomozboyeva: 2026-07-02
Elbek Sadriyev: 2026-07-04
Nodirxo'ja Muzaffarov: 2026-07-01
Sultonova Komila: 2026-07-28

### R37
Ibrohim Ismoilov: 2026-06-13
Mahliyo Musulmonova: 2026-07-01
Muhammadiev Bekzod: 2026-07-30
Muslima G'ofurova: 2026-06-02 (с профиля)
Ulug'bek Raimqulov: 2026-06-18
Xojiakbar: 2026-07-20
Yunus Hamdamov: 2026-07-01
Ziyayeva Madina: 2026-07-28
Zokirjon Shokirov: 2026-07-01

### R39
G'iyosiddin Sodiqov: 2026-07-09
Muslima Murodova: 2026-06-04
Muslima Saidova: 2026-06-04
Sevinch Muxammadiyeva: 2026-06-26
Sojida Umarova: 2026-06-04

### R4
Bilol Jo'rayev: 2026-07-27
Dinora Turdimurodova: 2026-01-21 (с профиля, статус Frozen)
Habibulloh Jo'rayev: 2026-06-19
Munisa Karimova: 2026-06-01
Munisa Nazirova: 2026-07-08
Muqaddas Jo`rayeva: 2026-05-06 (с профиля)
Shahriyor Kamoliddinov: 2026-07-06
Ulug'bek Usmonov: 2026-07-13
Zubayr Ahromov: 2026-07-31
Zuhriddin Jamoliddinov: 2026-02-10 (с профиля, статус Frozen)

### R40
Diyora Normamatova: 2026-04-02
Lobar Tadjimirzayeva: 2026-06-23
Ozodbek Rajabov: 2026-07-07
Rasulova Robiya: 2026-06-13
Samandar Ermatov: 2026-07-04

### R41
Abdujabbor Asrorov: 2026-06-23
Asliddin Oybekov: 2026-06-13 (статус Frozen)
E'zoza Usmanova: 2026-06-23
Madina Zoidbekova: 2026-07-04
Qudratjon Kabirjonov: 2026-06-06
Sharifabonu Ahrorjonova: 2026-07-28

### R42
Abduqodir Toirov: 2026-04-09 (с профиля, статус Frozen)
E`zoza To`raboyeva: 2026-07-03
Farhod Abdug'aniyev: 2026-06-23
Hayrulla Abdukamolov: 2026-01-17 (с профиля)
Javohir Turdiyev: 2026-07-16
Komila Egamberdiyeva: 2026-07-02
Malika Fattoyeva: 2026-08-01
Muhammadziyo Abdulxamidov: 2026-03-28 (с профиля)
Safar Nishonaliyev: 2026-01-10 (с профиля, статус Frozen)
Shahruz Sharifov: 2026-04-02 (с профиля, статус Frozen)
Shohjaxon Erkinov: 2026-07-07

### R5
Abduazim Axrorov: 2026-04-08 (с профиля)
Asadbek Ergashev: 2026-06-19
Iroda Alimbekova: 2026-07-01
Jahongir: 2026-07-17
Madina Sharipova: 2026-07-03
Muhammadjon Rustamov: 2026-07-13
Shahlo Sayfuddinova: 2026-07-29
Shahruza Muqumjonova: 2026-07-01
Soliha Xikmatova: 2026-07-08

### R6
Sarvinoz Muhammadkulova: 2026-07-31
Sevara Sho'ldasova: 2026-02-06 (с профиля, статус Frozen)

### R7
Axmadxon Shuxratov: 2026-07-31
Boburbek Sultonov: 2026-07-16
Diyorbek Yursunov: 2026-06-22
Hojiakbar Zuxriddinov: 2026-05-18
Mahsudali Voxobjonov: 2026-05-18

## Собрано всё (28/28 групп)

## Что делать после сбора всех 28 групп

1. Собрать имя→groupCode для оставшихся групп аналогично (у нас уже есть
   полное имя→groupCode соответствие для всех 143 активных студентов — оно
   зашито в `scripts/_check_group_rosters.mjs`, но этот файл я удалил после
   использования; при необходимости данные есть в истории диалога).
2. Написать скрипт `_fix_activation_dates.mjs`: для каждого имени найти
   студента в Firestore (`students` where fullName==...), обновить
   `createdAt` на новую дату (Timestamp), плюс синхронно обновить
   соответствующий `enrollments.addedAt`/`activatedAt` на то же значение.
3. Прогнать `formatAvgMonths`/дашборд — среднее должно резко упасть
   (реальные сроки в основном недели-месяцы, не годы).
4. Явное подтверждение пользователя перед записью в боевую базу (как и
   раньше в этой сессии).

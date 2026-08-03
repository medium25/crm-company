/**
 * Единый источник правды по структуре сущностей Firestore.
 * При изменении схемы: правим сначала «02 · Модель данных» в CLAUDE.md, потом этот файл, потом код.
 */

/**
 * @typedef {'ceo' | 'manager' | 'admin' | 'teacher'} Role ceo/manager/admin — равнозначный полный доступ
 */

/**
 * @typedef {Object} Branch
 * @property {string} id
 * @property {string} name
 * @property {string} address
 * @property {string} phone
 * @property {string} timezone
 * @property {string} currency
 * @property {number} lessonsPerMonth
 * @property {boolean} isArchived
 */

/**
 * @typedef {Object} Staff
 * @property {string} id uid из Firebase Auth
 * @property {string} fullName
 * @property {string} phone
 * @property {string} email
 * @property {Role} role
 * @property {string[]} branchIds
 * @property {string|null} teacherId заполнен, если role === 'teacher'
 * @property {boolean} isActive
 */

/**
 * @typedef {Object} Course
 * @property {string} id
 * @property {string} name
 * @property {number} defaultPrice цена в месяц по умолчанию
 * @property {number} defaultDurationMonths
 * @property {string} color
 * @property {boolean} isArchived
 */

/**
 * @typedef {Object} Room
 * @property {string} id
 * @property {string} branchId
 * @property {string} name
 * @property {number} capacity
 * @property {boolean} isArchived
 */

/**
 * @typedef {Object} Teacher
 * @property {string} id
 * @property {string} branchId
 * @property {string} displayName как отображается в списках, напр. "MR SANJAR"
 * @property {string} fullName
 * @property {string} phone
 * @property {string|null} staffUid если у учителя есть вход в систему
 * @property {string[]} branchIds
 * @property {number} groupsCount денормализовано
 * @property {boolean} isActive
 * @property {boolean} isArchived
 */

/**
 * @typedef {'even' | 'odd' | 'weekdays'} ScheduleType
 */

/**
 * @typedef {Object} GroupSchedule
 * @property {ScheduleType} type
 * @property {number[]} weekdays [1,3,5] если type === 'weekdays', 0=вс
 * @property {string} time "18:30"
 * @property {number} durationMin
 */

/**
 * @typedef {'planned' | 'active' | 'finished' | 'archived'} GroupStatus
 */

/**
 * @typedef {Object} Group
 * @property {string} id
 * @property {string} branchId
 * @property {string} code "I14", "R30", "MINI 1"
 * @property {number} publicId
 * @property {string} courseId
 * @property {string} courseName денорм.
 * @property {string} teacherId
 * @property {string} teacherName денорм.
 * @property {string} roomId
 * @property {string} roomName денорм.
 * @property {GroupSchedule} schedule
 * @property {import('firebase/firestore').Timestamp} startDate
 * @property {import('firebase/firestore').Timestamp} endDate
 * @property {number} price цена группы в месяц
 * @property {number} lessonsPerMonth наследуется от филиала, можно переопределить
 * @property {string[]} tags
 * @property {GroupStatus} status
 * @property {number} studentsCount денорм.
 * @property {boolean} isArchived
 */

/**
 * @typedef {'lead' | 'trial' | 'active' | 'paused' | 'left' | 'archived'} StudentStatus
 */

/**
 * @typedef {Object} Student
 * @property {string} id
 * @property {string} branchId
 * @property {number} publicId
 * @property {string} fullName
 * @property {string} phone цифры без плюса: "998940189956"
 * @property {string|null} phone2
 * @property {import('firebase/firestore').Timestamp|null} birthDate
 * @property {string|null} gender
 * @property {string|null} photoUrl
 * @property {StudentStatus} status
 * @property {string|null} statusReason причина ухода
 * @property {string|null} source instagram | telegram | друзья | наружная | другое
 * @property {number} balance денорм. агрегат: оплаты − списания
 * @property {import('firebase/firestore').Timestamp} balanceUpdatedAt
 * @property {string} note
 * @property {boolean} isFlagged
 * @property {number} activeGroupsCount денорм.
 * @property {import('firebase/firestore').Timestamp|null} firstPaymentAt
 * @property {import('firebase/firestore').Timestamp|null} lastPaymentAt
 * @property {import('firebase/firestore').Timestamp|null} trialAt
 * @property {import('firebase/firestore').Timestamp|null} leftAt
 * @property {import('firebase/firestore').Timestamp} createdAt
 * @property {string} createdBy
 * @property {boolean} isArchived
 */

/**
 * @typedef {'trial' | 'active' | 'paused' | 'left' | 'archived'} EnrollmentStatus
 */

/**
 * @typedef {Object} Enrollment
 * @property {string} id
 * @property {string} branchId
 * @property {string} studentId
 * @property {string} studentName денорм.
 * @property {string} groupId
 * @property {string} groupCode денорм.
 * @property {string} courseName денорм.
 * @property {string} teacherId
 * @property {string} teacherName денорм.
 * @property {EnrollmentStatus} status
 * @property {string} statusLabel напр. "Активен (Оплачивает обучение)"
 * @property {number} price цена для этого студента (со скидкой)
 * @property {number} discountPercent от group.price, для отчётов
 * @property {string} discountReason
 * @property {import('firebase/firestore').Timestamp} addedAt
 * @property {import('firebase/firestore').Timestamp|null} activatedAt с неё считаются деньги
 * @property {import('firebase/firestore').Timestamp|null} pausedFrom
 * @property {import('firebase/firestore').Timestamp|null} pausedTo
 * @property {import('firebase/firestore').Timestamp|null} leftAt
 * @property {string|null} leftReason
 * @property {string|null} lastChargedMonth "2026-07", защита от двойного списания
 * @property {boolean} isArchived
 */

/**
 * @typedef {'planned' | 'held' | 'cancelled'} LessonStatus
 */

/**
 * @typedef {Object} Lesson
 * @property {string} id "{groupId}_{YYYY-MM-DD}"
 * @property {string} branchId
 * @property {string} groupId
 * @property {string} groupCode
 * @property {string} teacherId
 * @property {import('firebase/firestore').Timestamp} date
 * @property {string} dateKey "2026-07-24"
 * @property {string} month "2026-07"
 * @property {LessonStatus} status
 * @property {string} topic
 * @property {string|null} cancelReason
 * @property {string|null} markedBy
 * @property {import('firebase/firestore').Timestamp|null} markedAt
 */

/**
 * @typedef {'present' | 'absent' | 'late' | 'excused'} AttendanceStatus
 */

/**
 * @typedef {Object} Attendance подколлекция lessons/{lessonId}/attendance/{studentId}
 * @property {string} id studentId
 * @property {string} studentName
 * @property {AttendanceStatus} status
 * @property {string} comment
 * @property {string} groupId дублируется для collectionGroup-запросов
 * @property {string} month дублируется для collectionGroup-запросов
 * @property {string} markedBy
 * @property {import('firebase/firestore').Timestamp} markedAt
 */

/**
 * @typedef {'charge' | 'payment' | 'correction' | 'refund'} TransactionType
 */

/**
 * @typedef {'cash' | 'click' | 'payme' | 'uzum' | 'uzcard' | 'humo' | 'card' | 'transfer'} PaymentMethod
 */

/**
 * @typedef {Object} Transaction
 * @property {string} id charge_{enrollmentId}_{YYYY-MM} | авто (payment) | rev_{originalTransactionId} (сторно)
 * @property {string} branchId
 * @property {string} studentId
 * @property {string} studentName
 * @property {string} enrollmentId
 * @property {string} groupId
 * @property {string} groupCode
 * @property {string} teacherId
 * @property {string} teacherName
 * @property {TransactionType} type
 * @property {number} amount charge/refund < 0, payment/correction — по знаку
 * @property {PaymentMethod|null} method только для payment
 * @property {import('firebase/firestore').Timestamp} date дата, к которой относится
 * @property {string} month "2026-07"
 * @property {string} comment
 * @property {import('firebase/firestore').Timestamp|null} periodFrom для списаний
 * @property {import('firebase/firestore').Timestamp|null} periodTo
 * @property {number|null} lessonsCount
 * @property {string} createdBy
 * @property {string} createdByName
 * @property {import('firebase/firestore').Timestamp} createdAt фактическое время ввода
 * @property {boolean} isReversed
 * @property {string|null} reversedBy
 */

/**
 * @typedef {Object} MonthlyBalance
 * @property {string} id "{studentId}_{YYYY-MM}"
 * @property {string} studentId
 * @property {string} month
 * @property {number} charges
 * @property {number} payments
 * @property {number} balance
 * @property {import('firebase/firestore').Timestamp} updatedAt
 */

/**
 * @typedef {Object} Comment P1
 * @property {string} id
 * @property {'student'|'group'|'lead'} entityType
 * @property {string} entityId
 * @property {string} text
 * @property {string} authorId
 * @property {string} authorName
 * @property {import('firebase/firestore').Timestamp} createdAt
 */

/**
 * @typedef {Object} ActivityLogEntry P1
 * @property {string} id
 * @property {string} entityType
 * @property {string} entityId
 * @property {string} action
 * @property {string} field
 * @property {*} before
 * @property {*} after
 * @property {string} userId
 * @property {string} userName
 * @property {import('firebase/firestore').Timestamp} createdAt
 */

/**
 * @typedef {Object} CallLog P1
 * @property {string} id
 * @property {string} studentId
 * @property {'in'|'out'} direction
 * @property {string} result
 * @property {string} comment
 * @property {number} durationSec
 * @property {string} userId
 * @property {import('firebase/firestore').Timestamp} createdAt
 */

/**
 * @typedef {'pending' | 'done'} TaskStatus
 */

/**
 * @typedef {Object} Task напоминание по студенту (раздел «Должники» и т.п.)
 * @property {string} id
 * @property {string} studentId
 * @property {string} studentName денорм.
 * @property {string} branchId
 * @property {string} text
 * @property {import('firebase/firestore').Timestamp} dueDate
 * @property {TaskStatus} status
 * @property {string} createdBy
 * @property {string} createdByName
 * @property {import('firebase/firestore').Timestamp} createdAt
 * @property {string|null} doneBy
 * @property {import('firebase/firestore').Timestamp|null} doneAt
 */

/**
 * @typedef {Object} SmsLog P1
 * @property {string} id
 * @property {string[]} studentIds
 * @property {string|null} groupId
 * @property {string} text
 * @property {string} status
 * @property {string} sentBy
 * @property {import('firebase/firestore').Timestamp} createdAt
 */

/**
 * @typedef {Object} Grade P1
 * @property {string} id
 * @property {string} lessonId
 * @property {string} groupId
 * @property {string} studentId
 * @property {number} value
 * @property {number} maxValue
 * @property {string} comment
 */

/**
 * @typedef {Object} ExamResult
 * @property {string} studentId
 * @property {number} score
 */

/**
 * @typedef {Object} Exam P1
 * @property {string} id
 * @property {string} groupId
 * @property {string} name
 * @property {import('firebase/firestore').Timestamp} date
 * @property {number} maxScore
 * @property {ExamResult[]} results
 */

/**
 * @typedef {'running' | 'done' | 'error'} BillingRunStatus
 */

/**
 * @typedef {Object} BillingRun
 * @property {string} id "{branchId}_{YYYY-MM}"
 * @property {BillingRunStatus} status
 * @property {import('firebase/firestore').Timestamp} startedAt
 * @property {import('firebase/firestore').Timestamp|null} finishedAt
 * @property {number} processed
 * @property {string[]} errors
 */

/**
 * @typedef {'month' | 'quarter' | 'year'} ChurnPeriod
 */

/**
 * @typedef {Object} Settings id = branchId
 * @property {string} id
 * @property {PaymentMethod[]} paymentMethods
 * @property {string[]} leaveReasons причины ухода
 * @property {string[]} leadSources источники лидов
 * @property {Object[]} smsTemplates
 * @property {string[]} holidays даты-строки "YYYY-MM-DD"
 * @property {ChurnPeriod} churnPeriod
 */

export {};

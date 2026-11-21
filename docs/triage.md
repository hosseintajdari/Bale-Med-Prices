# Triage Guide / راهنمای تریاژ و اولویت‌بندی

## Label Taxonomy / دسته‌بندی برچسب‌ها

### Priority / اولویت
| Label | Meaning (EN) | معنی (FA) |
|---|---|---|
| `priority: P1` | Critical — blocks release or production | بحرانی — مسدودکننده پروداکشن یا انتشار |
| `priority: P2` | High — resolve in current sprint | مهم — بررسی و رفع در اسپرینت جاری |
| `priority: P3` | Low — backlog or nice-to-have | عادی — بک‌لاگ یا موارد پیشنهادی غیرفوری |

### Status / وضعیت
| Label | Meaning (EN) | معنی (FA) |
|---|---|---|
| `status: planned` | Accepted and scheduled | پذیرفته‌شده و زمان‌بندی‌شده |
| `status: in progress` | Actively worked on | در حال توسعه و کار فعال |

### Area / بخش
| Label | Meaning (EN) | معنی (FA) |
|---|---|---|
| `area: docs` | Documentation and guides | مستندات و راهنماها |
| `area: ci` | CI/CD pipelines and automation | پایپ‌لاین‌های CI/CD و اتوماسیون |
| `area: security` | Security, auth, credentials | امنیت، احراز هویت و مدیریت کلیدها |

### Workflow / گردش کار
| Label | Meaning (EN) | معنی (FA) |
|---|---|---|
| `needs-triage` | New — awaiting review | جدید — در انتظار بررسی اولیه |
| `needs-info` | Waiting on reporter | در انتظار توضیحات تکمیلی گزارش‌دهنده |
| `bug` | Reproducible defect | باگ تایید شده |
| `enhancement` | Feature or improvement | قابلیت جدید یا بهبود |

---

## Triage Flow / گردش کار تریاژ

```
New issue opened (ایجاد ایشو جدید)
  └─ auto-label: needs-triage
       └─ Review by maintainer (بررسی توسط نگهدارنده)
            ├─ Needs more info? (اطلاعات ناکافی) → add needs-info, comment
            ├─ Confirmed bug? (باگ تاییدشده)   → add bug + priority:Px, remove needs-triage
            ├─ Feature request? (پیشنهاد قابلیت) → add enhancement + priority:Px, remove needs-triage
            └─ Duplicate? (تکراری)             → add duplicate, close with link
```

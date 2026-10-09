# API-first aggregator as the shared pricing/search core

Accepted (۱۷ مهر ۱۴۰۵). «مد اگریگیتور» هسته‌ی مشترک قیمت/سرچ برای وب، تلگرام، بله و واتساپ است — همان هدف README («one shared pricing and search core»). بات‌ها و وب کلاینت نازک روی `GET /search?q=` می‌شوند؛ منطق قیمت/سرچ فقط یک‌جا زندگی می‌کند. قرارداد آداپتر: هر منبع فقط `search(product) -> [PriceHit]` پیاده می‌کند. قانون سفت: قیمت بی‌تاریخ (`crawledAt` اجباری) وارد سیستم نمی‌شود.

"""Synthetic reference data. All names, banks and identifiers are fictional."""

import random

BANKS = [
    "Банк Сарыарка",
    "Алатау Финанс",
    "Есиль Банк",
    "Тенгри Капитал",
    "Каспий Кредит",
    "Степной Банк",
]

CITIES = ["Астана", "Алматы", "Шымкент", "Караганда", "Актобе", "Атырау", "Павлодар", "Костанай"]

FOREIGN = {
    "RU": "Москва",
    "UZ": "Ташкент",
    "KG": "Бишкек",
    "AE": "Дубай",
    "TR": "Стамбул",
    "CN": "Урумчи",
    "VG": "Road Town",
    "PA": "Панама",
    "SC": "Виктория",
    "KY": "Джорджтаун",
}

_FIRST = [
    "Айдар",
    "Динара",
    "Ерлан",
    "Жанар",
    "Нурлан",
    "Асель",
    "Тимур",
    "Гульнара",
    "Арман",
    "Мадина",
    "Санжар",
    "Камила",
    "Бауыржан",
    "Алия",
    "Даурен",
    "Сауле",
]
_LAST = [
    "Ахметов",
    "Сериков",
    "Жумабаев",
    "Нургалиев",
    "Касымов",
    "Тулегенов",
    "Абенов",
    "Мухамеджанов",
    "Есенов",
    "Бекмуханов",
    "Оспанов",
    "Ибраев",
]
_COMPANY_ROOT = [
    "Алтын Жол",
    "Дала Трейд",
    "Сункар Логистик",
    "Номад Строй",
    "Каспий Ойл Сервис",
    "Тау Агро",
    "Жибек Импэкс",
    "Kazakh Steppe Mining",
    "Silk Gate Holding",
    "Арай Девелопмент",
    "Bright Horizon Ltd",
    "Orient Capital Partners",
]
_COMPANY_FORM = ["ТОО", "АО", "ИП"]

PURPOSES = [
    "Оплата по договору поставки",
    "Возврат займа",
    "Перевод собственных средств",
    "Оплата услуг",
    "Заработная плата",
    "Финансовая помощь",
    "Оплата консультационных услуг",
    "Покупка оборудования",
    "Пополнение счёта",
    "Оплата аренды",
]


def person_name(rng: random.Random) -> str:
    last = rng.choice(_LAST)
    first = rng.choice(_FIRST)
    if first.endswith("а") or first in {"Асель", "Сауле", "Алия", "Жанар"}:
        last += "а"
    return f"{last} {first}"


def company_name(rng: random.Random) -> str:
    form = rng.choice(_COMPANY_FORM)
    root = rng.choice(_COMPANY_ROOT)
    if form == "ИП":
        return f"ИП «{person_name(rng)}»"
    return (
        f"{form} «{root}{'' if rng.random() < 0.6 else ' ' + rng.choice(['KZ', 'Group', 'Plus'])}»"
    )


def tax_id(rng: random.Random) -> str:
    return "".join(str(rng.randint(0, 9)) for _ in range(12))

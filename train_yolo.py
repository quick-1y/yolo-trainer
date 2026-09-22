from ultralytics import YOLO
import configparser
import torch
import os
import logging
from datetime import datetime

# ====== Красивый вывод (только для статической информации) ======
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich import box

console = Console()

# ==============================
# Вспомогательные функции
# ==============================

def parse_device(device_str):
    device_str = device_str.strip()
    if device_str.lower() == "cpu":
        return "cpu"
    if "," in device_str:
        return [int(d) for d in device_str.split(",")]
    return int(device_str)

def auto_batch(imgsz, gpu_vram=12):
    if gpu_vram >= 12:
        return min(32, max(16, 12288 // (imgsz * imgsz // 1024)))
    return 16

def quality_assessment(map50):
    if map50 >= 0.90:
        return "🔥 Отличная модель"
    elif map50 >= 0.75:
        return "👍 Хороший результат"
    elif map50 >= 0.60:
        return "⚠️ Среднее качество (можно улучшить)"
    else:
        return "❌ Требуется дообучение"

# ==============================
# Основное обучение
# ==============================

def train(config):
    console.print(Panel("🚀 Запуск обучения модели YOLO", style="bold cyan"))

    # ---- Получаем параметр verbose из конфига ----
    verbose_mode = config.getboolean("verbose", fallback=False)

    # Настройка логирования Ultralytics в зависимости от verbose
    if verbose_mode:
        logging.getLogger("ultralytics").setLevel(logging.INFO)
        console.print("📢 Режим вывода: [bold yellow]ПОДРОБНЫЙ[/bold yellow] (логи Ultralytics)")
    else:
        logging.getLogger("ultralytics").setLevel(logging.CRITICAL)
        console.print("📢 Режим вывода: [bold]МИНИМАЛЬНЫЙ[/bold] (только итоговые метрики)")

    # ==== Устройство ====
    if torch.cuda.is_available():
        device_value = parse_device(config["device"])
        gpu_name = torch.cuda.get_device_name(0)
        console.print(f"🖥 GPU: [bold green]{gpu_name}[/bold green]")
    else:
        device_value = "cpu"
        console.print("🖥 CPU")

    imgsz = config.getint("imgsz")
    batch = auto_batch(imgsz)
    total_epochs = config.getint("epochs")

    console.print(f"📐 Размер изображения: {imgsz}")
    console.print(f"📦 Batch size: {batch}")
    console.print(f"🔁 Эпохи: {total_epochs}")
    console.print()

    model = YOLO(config["name_model"])
    yaml_path = os.path.join(config["dataset_path"], "data.yaml")

    start_time = datetime.now()

    # Запуск обучения
    model.train(
        data=yaml_path,
        epochs=total_epochs,
        batch=batch,
        imgsz=imgsz,
        device=device_value,
        verbose=verbose_mode,          # зависит от значения из конфига
        workers=config.getint("workers"),
        optimizer=config["optimizer"],
        pretrained=config.getboolean("pretrained"),
        amp=config.getboolean("amp"),
        augment=config.getboolean("augment"),
        project=config["project"],
        name=config["name"],
    )

    # ==============================
    # Завершение
    # ==============================

    end_time = datetime.now()
    total_time = end_time - start_time

    save_dir = model.trainer.save_dir
    best_path = os.path.join(save_dir, "weights", "best.pt")

    console.print(Panel("🎉 Обучение завершено", style="bold green"))
    console.print(f"💾 Лучшая модель:\n{best_path}\n")

    # ===== Получаем финальные метрики =====
    metrics = model.val(data=yaml_path, verbose=False)

    precision, recall, map50, map95 = metrics.mean_results()

    table = Table(title="📊 Итоговые метрики", box=box.ROUNDED)
    table.add_column("Метрика", justify="left")
    table.add_column("Значение", justify="right")

    table.add_row("🎯 Точность (Precision)", f"{precision:.2%}")
    table.add_row("🔎 Полнота (Recall)", f"{recall:.2%}")
    table.add_row("⭐ Качество (mAP50)", f"{map50:.2%}")
    table.add_row("📈 Строгая оценка (mAP50-95)", f"{map95:.2%}")

    console.print(table)
    console.print()

    console.print(
        Panel(
            quality_assessment(map50),
            style="bold green" if map50 >= 0.75 else "bold red"
        )
    )

    console.print(f"\n⏱ Общее время обучения: {total_time}")
    console.print()

# ==============================
# Точка входа
# ==============================

if __name__ == "__main__":
    conf = configparser.ConfigParser()
    conf.read("Config/Config.ini")
    train(conf["Train"])
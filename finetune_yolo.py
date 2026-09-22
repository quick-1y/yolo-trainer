# finetune_yolo.py
from ultralytics import YOLO
import configparser
import torch
import os
import logging
from datetime import datetime

# ====== Красивый вывод ======
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
# Основное дообучение
# ==============================

def finetune(config):
    console.print(Panel("🚀 Дообучение модели YOLO", style="bold cyan"))

    # ---- Получаем параметр verbose из конфига ----
    verbose_mode = config.getboolean("verbose", fallback=False)

    # Настройка логирования Ultralytics
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
    batch = config.getint("batch")
    total_epochs = config.getint("epochs")

    console.print(f"📐 Размер изображения: {imgsz}")
    console.print(f"📦 Batch size: {batch}")
    console.print(f"🔁 Эпохи: {total_epochs}")
    console.print()

    # 🔥 Загружаем уже обученную модель
    base_model_path = config["base_model_path"]

    if not os.path.exists(base_model_path):
        console.print(f"[bold red]❌ Модель не найдена: {base_model_path}[/bold red]")
        raise FileNotFoundError(f"Модель не найдена: {base_model_path}")

    model = YOLO(base_model_path)
    yaml_path = os.path.join(config["dataset_path"], "data.yaml")

    start_time = datetime.now()

    # Запуск дообучения
    model.train(
        data=yaml_path,
        epochs=total_epochs,
        batch=batch,
        imgsz=imgsz,
        device=device_value,
        workers=config.getint("workers"),
        pretrained=False,          # не загружаем заново yolov8n.pt
        resume=False,              # не продолжаем прошлый run
        optimizer=config["optimizer"],
        lr0=config.getfloat("lr0"),
        lrf=config.getfloat("lrf"),
        warmup_epochs=config.getint("warmup_epochs"),
        single_cls=config.getboolean("single_cls"),
        amp=config.getboolean("amp"),
        close_mosaic=config.getint("close_mosaic"),
        augment=config.getboolean("augment"),
        project=config["project"],
        name=config["name"],
        save_period=config.getint("save_period"),
        plots=True,
        verbose=verbose_mode,      # зависит от конфига
    )

    # ==============================
    # Завершение
    # ==============================

    end_time = datetime.now()
    total_time = end_time - start_time

    save_dir = model.trainer.save_dir
    best_path = os.path.join(save_dir, "weights", "best.pt")

    console.print(Panel("✅ Fine-tuning завершён", style="bold green"))
    console.print(f"💾 Новая модель:\n[bold cyan]{best_path}[/bold cyan]\n")

    # ===== Получаем финальные метрики на тесте =====
    console.print("[bold]Проверка на test dataset...[/bold]")
    test_results = model.val(data=yaml_path, split="test", verbose=False)

    # Используем mean_results() для получения метрик
    precision, recall, map50, map95 = test_results.mean_results()

    table = Table(title="📊 Итоговые метрики (test)", box=box.ROUNDED)
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

    console.print(f"\n⏱ Общее время fine-tune: {total_time}")
    console.print()

# ==============================
# Точка входа
# ==============================

if __name__ == "__main__":
    conf = configparser.ConfigParser()
    conf.read("config/config.ini")
    finetune(conf["Finetune"])
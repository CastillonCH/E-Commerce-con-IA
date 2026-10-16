"""CU1 — Entrena el clasificador de imágenes por transfer learning.

Meta del T1 (OE1): accuracy top-1 >= 80% y F1-macro >= 0.75 sobre las 21
categorías (Tabla 10 del documento).

Requiere acceso a internet la PRIMERA vez que corre (para descargar los
pesos de ImageNet de torchvision) — si este sandbox te niega
download.pytorch.org, corre este script en tu máquina o en Colab y trae
acá solo el checkpoint resultante (models/cu1_resnet50.pt).

Estructura de datos esperada (ver ai-service/data/README.md):

    data/images/
      Audio y audífonos/
        foto1.jpg
        foto2.jpg
      Laptops y computadoras/
        ...
      ... (una carpeta por cada una de las 21 categorías, nombre exacto)

Uso:
    python scripts/train_cu1_image.py --data-dir data/images --epochs 15
    python scripts/train_cu1_image.py --data-dir data/images --arquitectura efficientnet_b0
"""

import argparse
import json
import sys
import time
from pathlib import Path

import torch
from sklearn.metrics import accuracy_score, f1_score
from torch import nn, optim
from torch.utils.data import DataLoader, random_split
from torchvision import datasets, models, transforms

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import CATEGORIAS  # noqa: E402

TRANSFORM_TRAIN = transforms.Compose(
    [
        transforms.RandomResizedCrop(224),
        transforms.RandomHorizontalFlip(),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ]
)
TRANSFORM_EVAL = transforms.Compose(
    [
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ]
)


def construir_modelo(arquitectura: str, num_clases: int) -> nn.Module:
    if arquitectura == "resnet50":
        modelo = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V2)
        # Fine-tuning parcial: se congela todo menos el último bloque
        # residual y la cabeza — en CPU, ajustar la red completa es
        # demasiado lento para iterar; esto sigue siendo transfer learning
        # real (no solo "feature extraction" con la cabeza sola).
        for nombre, parametro in modelo.named_parameters():
            parametro.requires_grad = nombre.startswith("layer4") or nombre.startswith("fc")
        modelo.fc = nn.Linear(modelo.fc.in_features, num_clases)
        return modelo

    if arquitectura == "efficientnet_b0":
        modelo = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.IMAGENET1K_V1)
        for nombre, parametro in modelo.named_parameters():
            parametro.requires_grad = nombre.startswith("features.8") or nombre.startswith(
                "classifier"
            )
        modelo.classifier[1] = nn.Linear(modelo.classifier[1].in_features, num_clases)
        return modelo

    raise ValueError(f"Arquitectura no soportada: {arquitectura}")


def evaluar(modelo: nn.Module, loader: DataLoader, dispositivo: str) -> dict[str, float]:
    modelo.eval()
    y_true, y_pred = [], []
    with torch.no_grad():
        for entradas, etiquetas in loader:
            entradas = entradas.to(dispositivo)
            logits = modelo(entradas)
            y_pred.extend(logits.argmax(dim=1).cpu().tolist())
            y_true.extend(etiquetas.tolist())
    return {
        "accuracy": round(accuracy_score(y_true, y_pred), 4),
        "f1_macro": round(f1_score(y_true, y_pred, average="macro"), 4),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--arquitectura", choices=["resnet50", "efficientnet_b0"], default="resnet50")
    parser.add_argument("--epochs", type=int, default=15)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--val-split", type=float, default=0.2)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("models/cu1_resnet50.pt"),
        help="Dónde guardar el checkpoint (lo que carga app/inference/image_classifier.py).",
    )
    args = parser.parse_args()

    dataset_completo = datasets.ImageFolder(args.data_dir, transform=TRANSFORM_TRAIN)
    clases_encontradas = set(dataset_completo.classes)
    clases_esperadas = set(CATEGORIAS)
    if clases_encontradas != clases_esperadas:
        faltantes = clases_esperadas - clases_encontradas
        sobrantes = clases_encontradas - clases_esperadas
        sys.exit(
            "Las carpetas de data-dir no coinciden con las 21 categorías de "
            f"app/config.py.\nFaltan: {sorted(faltantes) or '—'}\n"
            f"Sobran (nombre mal escrito?): {sorted(sobrantes) or '—'}"
        )

    n_val = int(len(dataset_completo) * args.val_split)
    n_train = len(dataset_completo) - n_val
    if n_val == 0:
        sys.exit(f"Muy pocas imágenes ({len(dataset_completo)}) para separar un set de validación.")
    entrenamiento, validacion = random_split(dataset_completo, [n_train, n_val])
    # El split de validación no debe usar el data-augmentation de entrenamiento.
    validacion.dataset = datasets.ImageFolder(args.data_dir, transform=TRANSFORM_EVAL)

    train_loader = DataLoader(entrenamiento, batch_size=args.batch_size, shuffle=True, num_workers=2)
    val_loader = DataLoader(validacion, batch_size=args.batch_size, num_workers=2)

    dispositivo = "cuda" if torch.cuda.is_available() else "cpu"
    modelo = construir_modelo(args.arquitectura, len(dataset_completo.classes)).to(dispositivo)
    parametros_entrenables = [p for p in modelo.parameters() if p.requires_grad]
    optimizador = optim.Adam(parametros_entrenables, lr=args.lr)
    criterio = nn.CrossEntropyLoss()

    print(f"Entrenando {args.arquitectura} en {dispositivo} — {n_train} train / {n_val} val")
    mejor_f1 = -1.0
    mejor_metricas: dict[str, float] = {}
    inicio = time.time()

    for epoca in range(1, args.epochs + 1):
        modelo.train()
        perdida_total = 0.0
        for entradas, etiquetas in train_loader:
            entradas, etiquetas = entradas.to(dispositivo), etiquetas.to(dispositivo)
            optimizador.zero_grad()
            perdida = criterio(modelo(entradas), etiquetas)
            perdida.backward()
            optimizador.step()
            perdida_total += perdida.item() * entradas.size(0)

        metricas = evaluar(modelo, val_loader, dispositivo)
        print(
            f"época {epoca}/{args.epochs}  loss={perdida_total / n_train:.4f}  "
            f"val_accuracy={metricas['accuracy']}  val_f1_macro={metricas['f1_macro']}"
        )

        if metricas["f1_macro"] > mejor_f1:
            mejor_f1 = metricas["f1_macro"]
            mejor_metricas = metricas
            args.output.parent.mkdir(parents=True, exist_ok=True)
            torch.save(
                {
                    "modelo": modelo.state_dict(),
                    "clases": dataset_completo.classes,
                    "arquitectura": args.arquitectura,
                    "metricas": mejor_metricas,
                },
                args.output,
            )

    duracion_min = round((time.time() - inicio) / 60, 1)
    cumple_meta = mejor_metricas.get("accuracy", 0) >= 0.80 and mejor_metricas.get("f1_macro", 0) >= 0.75
    print(f"\nListo en {duracion_min} min. Mejores métricas (val): {mejor_metricas}")
    print("Meta OE1 (accuracy>=0.80, F1-macro>=0.75):", "CUMPLIDA ✓" if cumple_meta else "NO alcanzada todavía")
    print(f"Checkpoint guardado en {args.output}")

    metricas_path = args.output.with_suffix(".metricas.json")
    metricas_path.write_text(json.dumps(mejor_metricas, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

const vscode = require("vscode");
const { PNG } = require("pngjs");

function activate(context) {
  let colorDataProvider = new ColorSquaresProvider();
  vscode.window.createTreeView("colorSquaresView", {
    treeDataProvider: colorDataProvider,
    showCollapseAll: true,
  });
  vscode.commands.registerCommand("copyColorToClipboard", (color) => {
    vscode.env.clipboard.writeText(color);
    vscode.window.showInformationMessage(`Copied ${color} to clipboard!`);
  });
  vscode.commands.registerCommand("addNewColor", async () => {
    const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

    const color = await vscode.window.showInputBox({
      prompt: "Enter a new color (e.g., #RRGGBB):",
    });
    if (!color) return;

    if (!hexColorRegex.test(color)) {
      vscode.window.showErrorMessage(
        "Invalid hex color. Please enter a valid hex color (e.g., #RRGGBB)."
      );
      return;
    }
    const type = await vscode.window.showQuickPick(["Primary", "Other"], {
      placeHolder: "Select a category for the color",
    });
    if (!type) return;
    if (type === "Primary") {
      const shouldGenerate = await vscode.window.showQuickPick(["Yes", "No"], {
        placeHolder: "Generate shades and tints automatically?",
      });
      if (shouldGenerate === "Yes") {
        colorDataProvider.generateShadesAndTints(color);
      }
    }
    colorDataProvider.addColor(color, type);
  });
  vscode.commands.registerCommand("deleteColor", (color) => {
    colorDataProvider.deleteColor(color, color.tooltip);
    vscode.window.showInformationMessage(
      `Deleted ${color.id} from ${color.tooltip}!`
    );
  });
}

function getPngDataUriForColor(color) {
  const png = new PNG({ width: 24, height: 24 });
  const hex = color.substring(1);
  const rgb = {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16),
  };
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (png.width * y + x) << 2;
      png.data[idx] = rgb.r;
      png.data[idx + 1] = rgb.g;
      png.data[idx + 2] = rgb.b;
      png.data[idx + 3] = 255;
    }
  }
  const buffer = PNG.sync.write(png);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

class ColorSquaresProvider {
  constructor() {
    this.colors = { Primary: [], Tints: [], Shades: [], Other: [] };
  }
  addColor(color, type) {
    if (type === "Primary" || type === "Other") {
      const index = this.colors[type].indexOf(color);
      if (index != -1) {
        return;
      }
    }
    this.colors[type].push(color);
    vscode.window.createTreeView("colorSquaresView", {
      treeDataProvider: this,
    });
  }

  generateShadesAndTints(baseColor) {
    this.colors["Tints"] = [];
    this.colors["Shades"] = [];

    const numVariations = 15;
    const factor = 1 / (numVariations + 1);

    const hexToRgb = (hex) => {
      let bigint = parseInt(hex.substring(1), 16);
      let r = (bigint >> 16) & 255;
      let g = (bigint >> 8) & 255;
      let b = bigint & 255;
      return { r, g, b };
    };
    const rgbToHex = (r, g, b) =>
      `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    const baseRgb = hexToRgb(baseColor);

    for (let i = 1; i <= numVariations; i++) {
      let tintColor = {
        r: Math.round(baseRgb.r + (255 - baseRgb.r) * factor * i),
        g: Math.round(baseRgb.g + (255 - baseRgb.g) * factor * i),
        b: Math.round(baseRgb.b + (255 - baseRgb.b) * factor * i),
      };
      this.colors["Tints"].push(
        rgbToHex(tintColor.r, tintColor.g, tintColor.b)
      );

      let shadeColor = {
        r: Math.round(baseRgb.r * (1 - factor * i)),
        g: Math.round(baseRgb.g * (1 - factor * i)),
        b: Math.round(baseRgb.b * (1 - factor * i)),
      };
      this.colors["Shades"].push(
        rgbToHex(shadeColor.r, shadeColor.g, shadeColor.b)
      );
    }

    vscode.window.createTreeView("colorSquaresView", {
      treeDataProvider: this,
    });
  }

  getTreeItem(element) {
    return element;
  }
  getChildren(element) {
    if (!element) {
      const categories = Object.keys(this.colors).map((category) => {
        const item = new vscode.TreeItem(category);
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        return item;
      });
      const addItem = new vscode.TreeItem("Add New Color");
      addItem.command = { command: "addNewColor", title: "Add New Color" };
      categories.push(addItem);
      return categories;
    } else if (this.colors[element.label]) {
      return this.colors[element.label].map((color) => {
        let item = new vscode.TreeItem("");
        item.id = color;
        item.tooltip = element.label;
        item.description = color;

        item.iconPath = vscode.Uri.parse(getPngDataUriForColor(color));
        item.command = {
          command: "copyColorToClipboard",
          title: "Copy Color to Clipboard",
          arguments: [color],
        };

        item.contextValue = "color";

        return item;
      });
    }
    return [];
  }

  deleteColor(color, type) {
    const index = this.colors[type].indexOf(color.id);
    if (index > -1) {
      this.colors[type].splice(index, 1);
      vscode.window.createTreeView("colorSquaresView", {
        treeDataProvider: this,
      });
    }
  }
}

function deactivate() {}

module.exports = { activate, deactivate };

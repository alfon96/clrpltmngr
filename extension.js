const vscode = require("vscode");
const { PNG } = require("pngjs");

function activate(context) {
  let colorDataProviderTintsAndShades = new ColorSquaresProvider(
    ["Primary", "Tints", "Shades"],
    "colorSquaresViewTintsAndShades",
    "GenerateTintsAndShades"
  );
  let colorDataProviderOthers = new ColorSquaresProvider(
    ["Others"],
    "colorSquaresViewOthers",
    "Others"
  );
  let colorDataProviderColorsInUse = new ColorSquaresProvider(
    ["UsedPrimaryColors", "UsedTints", "UsedShades", "Others"],
    "colorSquaresViewColorsInUse",
    "ColorsInUse"
  );

  const treeViewTS = vscode.window.createTreeView(
    "colorSquaresViewTintsAndShades",
    {
      treeDataProvider: colorDataProviderTintsAndShades,
    }
  );

  const treeViewOthers = vscode.window.createTreeView(
    "colorSquaresViewOthers",
    {
      treeDataProvider: colorDataProviderOthers,
    }
  );

  const treeViewColorsInUse = vscode.window.createTreeView(
    "colorSquaresViewColorsInUse",
    {
      treeDataProvider: colorDataProviderColorsInUse,
    }
  );

  vscode.commands.registerCommand("copyColorToClipboard", (color) => {
    vscode.env.clipboard.writeText(color);
    vscode.window.showInformationMessage(`Copied ${color} to clipboard!`);
  });

  vscode.commands.registerCommand("addNewColor", async (item) => {
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

    // Adjust behavior based on context
    if (item.command.tooltip === "GenerateTintsAndShades") {
      // Generate tints and shades
      colorDataProviderTintsAndShades.generateShadesAndTints(color);

      // Add primary
      addColorsToSection(
        colorDataProviderTintsAndShades,
        color,
        treeViewTS,
        "Primary"
      );

      vscode.window.showInformationMessage(
        `Created new TS-Palette from the primary color: ${color}`
      );
    } else if (item.command.tooltip === "Others") {
      addColorsToSection(
        colorDataProviderOthers,
        color,
        treeViewOthers,
        item.command.tooltip
      );

      vscode.window.showInformationMessage(`Pushed new color: ${color}. `);
    } else if (
      item.command.tooltip === "ColorsInUse" ||
      !item.command.tooltip
    ) {
      const isPrimary = await vscode.window.showQuickPick(["Yes", "No"], {
        placeHolder: "Is this a primary color?",
      });
      if (isPrimary === "Yes") {
        addColorsToSection(
          colorDataProviderColorsInUse,
          color,
          treeViewColorsInUse,
          "UsedPrimaryColors"
        );
      } else {
        addColorsToSection(
          colorDataProviderColorsInUse,
          color,
          treeViewColorsInUse,
          "Others"
        );
      }
      vscode.window.showInformationMessage(`Pushed new color: ${color}`);
    }
  });

  vscode.commands.registerCommand("deleteColor", (color) => {
    const deleteInfo = color.tooltip.split(";");
    if (deleteInfo[0] === "GenerateTintsAndShades") {
      colorDataProviderTintsAndShades.deleteColor(color, deleteInfo[1]);
    } else if (deleteInfo[0] === "Others") {
      colorDataProviderOthers.deleteColor(color, deleteInfo[1]);
    } else {
      colorDataProviderColorsInUse.deleteColor(color, deleteInfo[1]);
    }

    vscode.window.showInformationMessage(
      `Deleted ${color.description} from ${deleteInfo[1]}!`
    );
  });

  vscode.commands.registerCommand("scanDocumentForColors", () => {
    const colorsInUse = scanAndCategorizeColors();
    storeUsedColors(
      colorDataProviderColorsInUse,
      colorsInUse,
      treeViewColorsInUse
    );
  });
}

function storeUsedColors(colorDataProvider, colorsFound, treeView) {
  if (colorDataProvider.colors["UsedPrimaryColors"].length === 0) {
    colorsFound.forEach((color) => {
      addColorsToSection(colorDataProvider, color, treeView, "Others");
    });
    vscode.window.showInformationMessage(
      `Colors Retrived! For a better experience, choose a Primary Color.`
    );
  } else {
    const primaryLuminance = luminance(
      hexToRgb(colorDataProvider.colors["UsedPrimaryColors"][0] || "#FFFFFF")
    );

    colorDataProvider.colors["UsedTints"] = [];
    colorDataProvider.colors["UsedShades"] = [];
    colorsFound.forEach((color) => {
      const colorLuminance = luminance(hexToRgb(color));

      if (color === colorDataProvider.colors["UsedPrimaryColors"][0]) {
        addColorsToSection(
          colorDataProvider,
          color,
          treeView,
          "UsedPrimaryColors"
        );
      } else if (colorLuminance > primaryLuminance) {
        addColorsToSection(colorDataProvider, color, treeView, "UsedTints");
      } else if (colorLuminance < primaryLuminance) {
        addColorsToSection(colorDataProvider, color, treeView, "UsedShades");
      }
      colorDataProvider.colors["Others"] = colorDataProvider.colors[
        "Others"
      ].filter((color) => {
        // Check if the color is not in UsedTints or UsedShades
        return (
          !colorDataProvider.colors["UsedTints"].includes(color) &&
          !colorDataProvider.colors["UsedShades"].includes(color) &&
          !colorDataProvider.colors["UsedPrimaryColors"].includes(color)
        );
      });
    });

    vscode.window.showInformationMessage(
      `Scanned and categorized colors from the document!`
    );
  }
}

function addColorsToSection(
  colorDataProviderTintsAndShades,
  color,
  treeViewTS,
  section_attribute
) {
  const addedItem = colorDataProviderTintsAndShades.addColor(
    color,
    section_attribute
  );

  Object.keys(addedItem).map((item) =>
    treeViewTS.reveal(addedItem[item], {
      expand: vscode.TreeItemCollapsibleState.Expanded,
    })
  );
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

function hexToRgb(hex) {
  let bigint = parseInt(hex.substring(1), 16);
  let r = (bigint >> 16) & 255;
  let g = (bigint >> 8) & 255;
  let b = bigint & 255;
  return { r, g, b };
}

function luminance({ r, g, b }) {
  // sRGB formula
  let R = r / 255.0;
  let G = g / 255.0;
  let B = b / 255.0;

  R = R <= 0.03928 ? R / 12.92 : Math.pow((R + 0.055) / 1.055, 2.4);
  G = G <= 0.03928 ? G / 12.92 : Math.pow((G + 0.055) / 1.055, 2.4);
  B = B <= 0.03928 ? B / 12.92 : Math.pow((B + 0.055) / 1.055, 2.4);

  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function scanAndCategorizeColors() {
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    const docText = activeEditor.document.getText();
    const hexRegex = /#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})/g;
    return [...new Set(docText.match(hexRegex))];
  }
}

class ColorSquaresProvider {
  constructor(categories, viewId, sectionName) {
    this.categories = categories;
    this.viewId = viewId;
    this.colors = {};
    this.section = sectionName;
    this.isExpanded = {};
    this.lastAddedCategory = null;
    this.items = {};
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;

    for (let category of categories) {
      this.colors[category] = [];
    }
  }
  setIsExpanded(expanded, category) {
    this.isExpanded[category] = expanded;
  }

  getParent(element) {
    if (!element) {
      // If the element is null (a top-level category), return null.
      return null;
    }

    // Check if the element is a color (leaf node).
    if (element.contextValue === "color") {
      // Find the parent category for this color based on its description.
      for (const category of this.categories) {
        if (this.colors[category].includes(element.description)) {
          return this.items[category];
        }
      }
    }

    // If the element is not a color, return null.
    return null;
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

    vscode.window.createTreeView("colorSquaresViewTintsAndShades", {
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
        item.collapsibleState =
          this.isExpanded[category] === true
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed;
        item.contextValue = `category-${category}`; // Provide context
        this.items[category] = item;
        return item;
      });

      const addItem = new vscode.TreeItem("Add New Color");
      addItem.command = {
        command: "addNewColor",
        title: "Add New Color",
        arguments: [addItem],
        tooltip: this.section,
      };

      categories.push(addItem);

      if (this.section === "ColorsInUse") {
        const scanColorsItem = new vscode.TreeItem("Scan Document for Colors");
        scanColorsItem.command = {
          command: "scanDocumentForColors",
          title: "Scan Document for Colors",
        };
        categories.push(scanColorsItem);
      }
      return categories;
    } else if (this.colors[element.label]) {
      return this.colors[element.label].map((color) => {
        let item = new vscode.TreeItem("");
        item.id = color + element.label;
        item.tooltip = this.section + ";" + element.label;
        item.description = color;

        // Set the collapsible state for each color item
        item.collapsibleState = vscode.TreeItemCollapsibleState.None;

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

  addColor(color, type) {
    if (!this.colors[type].includes(color)) {
      this.colors[type].push(color);
    }
    this._onDidChangeTreeData.fire();

    return this.items;
  }

  deleteColor(color, type) {
    const index = this.colors[type].indexOf(color.description);
    if (index > -1) {
      this.colors[type].splice(index, 1);
      this._onDidChangeTreeData.fire();
    }
  }
}

function deactivate() {}

module.exports = { activate, deactivate };

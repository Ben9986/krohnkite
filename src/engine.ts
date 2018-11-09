// Copyright (c) 2018 Eon S. Jeon <esjeon@hyunmu.am>
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the "Software"),
// to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense,
// and/or sell copies of the Software, and to permit persons to whom the
// Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL
// THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.

class Screen {
    public id: number;
    public layout: any;
    public layoutOpts: any;

    constructor(id: number) {
        this.id = id;
        this.layout = layout_tile;
        this.layoutOpts = {};
    }
}

class Tile {
    public client: KWin.Client;
    public isNew: boolean;
    public isError: boolean;
    public geometry: QRect;

    constructor(client: KWin.Client) {
        this.client = client;
        this.isNew = true;
        this.isError = false;

        this.geometry = {
            height: 0,
            width: 0,
            x: 0,
            y: 0,
        };
    }
}

// TODO: declare Layout class (`layout.js`?)
// TODO: layouts in separate file(s)
function layout_tile(tiles: Tile[], areaWidth: number, areaHeight: number, opts: any) {
    if (!opts.tile_ratio) opts.tile_ratio = 0.45;
    if (!opts.tile_nmaster) opts.tile_nmaster = 1;

    let masterCount;
    let masterWidth;
    let masterHeight;
    let stackCount;
    let stackWidth;
    let stackHeight;
    let stackX;

    if (tiles.length <= opts.tile_nmaster) {
        masterCount = tiles.length;
        masterWidth = areaWidth;
        masterHeight = Math.floor(areaHeight / masterCount);

        stackCount = stackWidth = stackHeight = stackX = 0;
    } else {
        masterCount = opts.tile_nmaster;
        masterWidth = Math.floor(areaWidth * (1 - opts.tile_ratio));
        masterHeight = Math.floor(areaHeight / masterCount);

        stackCount = tiles.length - masterCount;
        stackWidth = areaWidth - masterWidth;
        stackHeight = Math.floor(areaHeight / stackCount);
        stackX = masterWidth + 1;
    }

    for (let i = 0; i < masterCount; i++) {
        tiles[i].geometry.x = 0;
        tiles[i].geometry.y = masterHeight * i;
        tiles[i].geometry.width = masterWidth;
        tiles[i].geometry.height = masterHeight;
    }

    for (let i = 0; i < stackCount; i++) {
        const j = masterCount + i;
        tiles[j].geometry.x = stackX;
        tiles[j].geometry.y = stackHeight * i;
        tiles[j].geometry.width = stackWidth;
        tiles[j].geometry.height = stackHeight;
    }
}

class TilingEngine {
    public screens: Screen[];
    private driver: KWinDriver;
    private tiles: Tile[];

    constructor(driver: KWinDriver) {
        this.driver = driver;
        this.tiles = Array();
        this.screens = Array();
    }

    public arrange = () => {
        this.screens.forEach((screen) => {
            if (screen.layout === null) return;

            const area = this.driver.getWorkingArea(screen.id);
            const visibles = this.tiles.filter((t) => {
                try {
                    return this.driver.isClientVisible(t.client, screen.id);
                } catch (e) {
                    t.isError = true;
                }
                return false;
            });

            // TODO: fullscreen handling
            screen.layout(visibles, area.width, area.height, screen.layoutOpts);

            visibles.forEach((tile) => {
                this.driver.setClientGeometry(tile.client, tile.geometry);
            });
        });
    }

    public arrangeClient = (client: KWin.Client) => {
        this.tiles.forEach((tile) => {
            if (tile.client !== client) return;

            const geometry = this.driver.getClientGeometry(tile.client);
            if (geometry.x === tile.geometry.x)
            if (geometry.y === tile.geometry.y)
            if (geometry.width === tile.geometry.width)
            if (geometry.height === tile.geometry.height)
                return;

            this.driver.setClientGeometry(tile.client, tile.geometry);
        });
    }

    public manageClient = (client: KWin.Client) => {
        this.tiles.push(new Tile(client));
        this.arrange();
    }

    public unmanageClient = (client: KWin.Client) => {
        this.tiles = this.tiles.filter((t) => {
            return t.client !== client && !t.isError;
        });
        this.arrange();
    }

    public addScreen = (screenId: number) => {
        this.screens.push(new Screen(screenId));
    }

    public removeScreen = (screenId: number) => {
        this.screens = this.screens.filter((screen) => {
            return screen.id !== screenId;
        });
    }

    public handleUserInput = (input: UserInput) => {
        // TODO: per-layout handlers
        switch (input) {
            case UserInput.Up: this.moveFocus(-1); this.arrange(); break;
            case UserInput.Down: this.moveFocus(+1); this.arrange(); break;
            case UserInput.ShiftUp: this.moveTile(-1); this.arrange(); break;
            case UserInput.ShiftDown: this.moveTile(+1); this.arrange(); break;
        }
    }

    /*
     * Privates
     */

    private getCurrentTileIndex = (): number => {
        // TODO: move this to driver
        const currentClient = workspace.activeClient;

        for (let i = 0; i < this.tiles.length; i++)
            if (this.tiles[i].client === currentClient)
                return i;
        return null;
    }

    private buildInputHandlermap = () => {
        const map = {};
        map[UserInput.Down] = () => { this.moveFocus(+1); };
        map[UserInput.Up] = () => { this.moveFocus(-1); };
        map[UserInput.ShiftDown] = () => { this.moveTile(+1); };
        map[UserInput.ShiftUp] = () => { this.moveTile(-1); };
    }

    private moveFocus = (step: number) => {
        if (step === 0) return;

        const index = this.getCurrentTileIndex();
        let newIndex = index + step;
        if (newIndex < 0)
            newIndex = 0;
        if (newIndex >= this.tiles.length)
            newIndex = this.tiles.length - 1;

        // TODO: move this to driver
        workspace.activeClient = this.tiles[newIndex].client;
    }

    private moveTile = (step: number) => {
        if (step === 0) return;

        let i = this.getCurrentTileIndex();
        let tmp: Tile;
        while (step > 0 && i + 1 < this.tiles.length) {
            tmp = this.tiles[i];
            this.tiles[i] = this.tiles[i + 1];
            this.tiles[i + 1] = tmp;
            i++; step--;
        }
        while (step < 0 && i - 1 >= 0) {
            tmp = this.tiles[i];
            this.tiles[i] = this.tiles[i - 1];
            this.tiles[i - 1] = tmp;
            i--; step++;
        }
    }
}
---
title: Installing, updates and where things are saved
summary: The Pare 3D app for Mac and Windows, how it keeps itself up to date, and where your designs, exports and backups go.
---

## Installing as an app

Pare 3D is a program for your Mac, Windows PC or Linux computer. It works without internet; it only goes online to look for updates.

1. Open the [Pare 3D releases page](https://github.com/rakeshjivan/pare-3d/releases/latest) and download the file for your computer: `Pare-3D-Mac.zip` for a Mac (Apple silicon or Intel), `Pare-3D-Windows.zip` for Windows 10 or 11, `Pare-3D-Linux.tar.gz` for 64-bit Linux.
2. **Mac:** unzip it and drag **Pare 3D** into your Applications folder, then open it. The first time, macOS asks whether to trust it: go to System Settings › Privacy & Security and click **Open Anyway**.
3. **Windows:** extract the folder and double-click **Pare 3D.exe**. If SmartScreen warns, choose **More info** › **Run anyway**.
4. **Linux:** unpack the folder somewhere it can stay and run `./pare3d`. Run `./pare3d --install` once to add Pare 3D to your applications menu (`--uninstall` takes it out again). With Google Chrome, Chromium, Edge, Brave or Vivaldi installed it opens in a window of its own; otherwise in your default browser. Designs are kept in `~/.pare3d/designs`.

Your designs live inside the app on this computer and are kept when the app updates or is replaced. Use {{ui:dashboard.backupAll}} now and then to keep a copy in a single file as well - see [Backing up and passing on](chapter:files-and-saving).

## Updates

Pare 3D updates itself. A few seconds after it opens, and every few hours while it stays open, it asks GitHub whether there is a newer build. If there is, it downloads it in the background. The line at the top right of the start page says what it found:

- **Up to date (build …)** - nothing to do.
- **A new build is ready** - open Pare 3D again, or click Reload there, and you are on it. Your open design is saved first.
- **Download the new version** - this new build needs a newer app around it; download it again from the releases page as above.

**Installed a new download but Pare 3D still shows an older build?** An older copy was still running in the background. From build 29 on, the app notices and replaces it by itself; with an app older than that, restart your computer once and open Pare 3D again. Your designs are not affected.

After an update, a **What's new** card lists what the build brought. You can read it again any time from **Help › What's new**.

A few things are built into the app itself rather than into the parts that update - choosing your own folders for exports and backups is one. If your app is older than those, **Settings › Files** says so and offers the download. To replace the app: use {{ui:dashboard.backupAll}} first, delete the old app (on a Mac, drag it from Applications to the Bin; on Windows, delete its folder) and install the new one as above. Your designs stay.

## Appearance

Pare 3D and this guide are in English. The colour scheme at the top right offers {{ui:theme.short.system}} (follows the operating system), {{ui:theme.short.light}}, {{ui:theme.short.dark}} and {{ui:theme.short.graphite}}, a neutral dark grey.

## Running it yourself

Pare 3D is free software (AGPL-3.0), based on [layerling](https://github.com/henmedia/layerling). Its source is on [GitHub](https://github.com/rakeshjivan/pare-3d): anyone may read it, build it and run their own copy, as long as they share their changes the same way. The MCP bridge for AI assistants comes with layerling's development server, see [Building with an AI](chapter:ai-with-mcp).

## Help and feedback

- **Help** at the top of the editor opens the quick guide, **Coming from Tinkercad?**, the keyboard shortcuts, this guide and **What's new**. **Interactive Help** explains any button you click.
- **Help › Send feedback** opens a page on GitHub where you can say what is hard, broken or missing. A screenshot helps.
- Each tool window has a question mark that opens the part of this guide that explains it.

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function FigureViewer({ src, caption, source }: { src: string; caption?: string; source?: string }) {
	const [zoom, setZoom] = useState(1);
	const [open, setOpen] = useState(false);
	return (
		<div className="space-y-2">
			<div className="overflow-hidden rounded-lg border bg-muted/30">
				<img
					src={src}
					alt={caption ?? "textbook figure"}
					style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
					className="mx-auto max-h-96 w-auto cursor-zoom-in object-contain transition-transform"
					onClick={() => setOpen(true)}
				/>
			</div>
			<div className="flex items-center gap-2 text-xs text-muted-foreground">
				<Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>Zoom in</Button>
				<Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>Zoom out</Button>
				<Button size="sm" variant="outline" onClick={() => setZoom(1)}>Reset</Button>
				{caption && <span className="ml-2 font-medium">{caption}</span>}
			</div>
			{source && <div className="whitespace-pre-line rounded border bg-card p-2 text-xs text-muted-foreground">{source}</div>}
			{open && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(false)}>
					<img src={src} alt={caption ?? "textbook figure"} className="max-h-full max-w-full object-contain" />
				</div>
			)}
		</div>
	);
}

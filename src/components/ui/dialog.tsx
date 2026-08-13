"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({ onOpenChange, ...props }: DialogPrimitive.Root.Props) {
  const handleOpenChange = (open: boolean, eventDetails: any) => {
    // Prevent closing if the reason is accidental click outside (backdrop press), escape key, or focus loss
    if (!open && eventDetails) {
      const { reason } = eventDetails;
      if (reason === "outsidePress" || reason === "escapeKey" || reason === "focusOut") {
        eventDetails.isCanceled = true;
        return;
      }
    }
    onOpenChange?.(open, eventDetails);
  };

  return (
    <DialogPrimitive.Root
      data-slot="dialog"
      disablePointerDismissal={true}
      onOpenChange={handleOpenChange}
      {...props}
    />
  )
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  style,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  const [dimensions, setDimensions] = React.useState<{ width?: number; height?: number }>({});
  const popupRef = React.useRef<HTMLDivElement>(null);

  const handleResizeStart = (
    e: React.MouseEvent | React.TouchEvent,
    direction: "right" | "bottom" | "corner"
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const popup = popupRef.current;
    if (!popup) return;

    const rect = popup.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const handleMove = (clientX: number, clientY: number) => {
      let newWidth = dimensions.width;
      let newHeight = dimensions.height;

      if (direction === "right" || direction === "corner") {
        newWidth = Math.max(320, Math.min(window.innerWidth - 32, Math.abs(clientX - centerX) * 2));
      }
      if (direction === "bottom" || direction === "corner") {
        newHeight = Math.max(200, Math.min(window.innerHeight - 32, Math.abs(clientY - centerY) * 2));
      }

      setDimensions({ width: newWidth, height: newHeight });
    };

    const onMouseMove = (moveEvent: MouseEvent) => {
      handleMove(moveEvent.clientX, moveEvent.clientY);
    };

    const onTouchMove = (touchEvent: TouchEvent) => {
      if (touchEvent.touches.length > 0) {
        handleMove(touchEvent.touches[0].clientX, touchEvent.touches[0].clientY);
      }
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    const onTouchEnd = () => {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };

    if ("touches" in e) {
      document.addEventListener("touchmove", onTouchMove, { passive: true });
      document.addEventListener("touchend", onTouchEnd);
    } else {
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    }
  };

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        ref={popupRef}
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        style={{
          ...style,
          width: dimensions.width ? `${dimensions.width}px` : undefined,
          height: dimensions.height ? `${dimensions.height}px` : undefined,
          maxWidth: dimensions.width ? "none" : undefined,
          maxHeight: dimensions.height ? "none" : undefined,
        }}
        {...props}
      >
        {showCloseButton && (
          <div className="sticky top-0 left-0 w-full h-0 z-50 pointer-events-none">
            <DialogPrimitive.Close
              data-slot="dialog-close"
              render={
                <Button
                  variant="ghost"
                  className="absolute top-2 right-2 pointer-events-auto hover:bg-slate-100 flex rounded-full"
                  size="icon-sm"
                />
              }
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>
        )}

        {children}

        {/* Resize Handles - completely invisible but fully interactive */}
        <div
          onMouseDown={(e) => handleResizeStart(e, "right")}
          onTouchStart={(e) => handleResizeStart(e, "right")}
          className="absolute top-0 right-0 w-2.5 h-full cursor-ew-resize select-none z-[100] opacity-0"
          title="Drag to adjust width"
        />

        <div
          onMouseDown={(e) => handleResizeStart(e, "bottom")}
          onTouchStart={(e) => handleResizeStart(e, "bottom")}
          className="absolute bottom-0 left-0 w-full h-2.5 cursor-ns-resize select-none z-[100] opacity-0"
          title="Drag to adjust height"
        />

        <div
          onMouseDown={(e) => handleResizeStart(e, "corner")}
          onTouchStart={(e) => handleResizeStart(e, "corner")}
          className="absolute right-0 bottom-0 w-4 h-4 cursor-se-resize select-none z-[100] opacity-0"
          title="Drag to adjust size"
        />
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "sticky top-0 bg-popover z-40 pb-3 border-b border-border/10 flex flex-col gap-2 -mx-4 -mt-4 p-4 pr-12 mb-2",
        className
      )}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}

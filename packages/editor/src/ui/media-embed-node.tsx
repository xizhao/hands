'use client';

import { parseVideoUrl } from '@platejs/media';
import { useMediaState } from '@platejs/media/react';
import { ResizableProvider, useResizableValue } from '@platejs/resizable';
import { PlateElement, type PlateElementProps, withHOC } from 'platejs/react';

import { cn } from '../lib/utils';

import { Caption, CaptionTextarea } from './caption';
import { MediaToolbar } from './media-toolbar';
import {
  mediaResizeHandleVariants,
  Resizable,
  ResizeHandle,
} from './resize-handle';

export const MediaEmbedElement = withHOC(
  ResizableProvider,
  function MediaEmbedElement(props: PlateElementProps) {
    const {
      align = 'center',
      embed,
      focused,
      isVideo,
      isYoutube,
      selected,
    } = useMediaState({
      urlParsers: [parseVideoUrl],
    });
    const width = useResizableValue('width');
    const provider = embed?.provider;

    return (
      <PlateElement className="py-2.5" {...props}>
        <figure className="relative m-0 w-full" contentEditable={false}>
          <Resizable
            align={align}
            options={{
              align,
              maxWidth: '100%',
              minWidth: 100,
            }}
          >
            <div className="group/media">
              <ResizeHandle
                className={mediaResizeHandleVariants({ direction: 'left' })}
                options={{ direction: 'left' }}
              />

              <ResizeHandle
                className={mediaResizeHandleVariants({ direction: 'right' })}
                options={{ direction: 'right' }}
              />

              {isVideo && !isYoutube && (
                <div
                  className={cn(
                    provider === 'vimeo' && 'pb-[75%]',
                    provider === 'youku' && 'pb-[56.25%]',
                    provider === 'dailymotion' && 'pb-[56.0417%]',
                    provider === 'coub' && 'pb-[51.25%]'
                  )}
                >
                  <iframe
                    allowFullScreen
                    className={cn(
                      'absolute top-0 left-0 aspect-video size-full rounded-sm',
                      isVideo && 'border-0',
                      focused && selected && 'ring-2 ring-ring ring-offset-2'
                    )}
                    src={embed!.url}
                    title="embed"
                  />
                </div>
              )}

              <MediaToolbar />
            </div>
          </Resizable>

          <Caption align={align} style={{ width }}>
            <CaptionTextarea placeholder="Write a caption..." />
          </Caption>
        </figure>

        {props.children}
      </PlateElement>
    );
  }
);

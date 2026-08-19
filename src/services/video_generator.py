"""Video generation service with multi-shot chaining."""

from typing import Dict, Any, List, Optional, Tuple
import asyncio
import aiohttp
from .providers import BaseProvider, ProviderError


class VideoGenerationService:
    """Service for generating videos with multi-shot chaining.
    
    Breaks down long prompts into sequential shots, generates each clip,
    and chains them together with transitions.
    """
    
    MIN_SHOT_DURATION = 3  # seconds (API minimum)
    MAX_TOTAL_DURATION = 60  # seconds (hard limit)
    TRANSITION_DURATION = 0.5  # seconds (overlap between shots)
    
    def __init__(self, provider: BaseProvider):
        """Initialize video generation service.
        
        Args:
            provider: AI provider instance for video generation
        """
        self.provider = provider
        self._session = None
    
    async def close(self):
        """Clean up resources."""
        if self._session and not self._session.closed:
            await self._session.close()
    
    async def generate_video(
        self,
        prompt: str,
        duration: int = 60,
        style: str = "cinematic",
        shot_count: Optional[int] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """Generate a complete video from prompt.
        
        Args:
            prompt: Video description
            duration: Total duration in seconds (max 60)
            style: Visual style (e.g., 'cinematic', 'anime', 'realistic')
            shot_count: Number of shots (auto-calculated if None)
            **kwargs: Additional parameters
            
        Returns:
            Generation result with video URL and metadata
        """
        # Validate duration
        duration = min(duration, self.MAX_TOTAL_DURATION)
        
        # Calculate shot count if not specified
        if shot_count is None:
            shot_count = self._calculate_shot_count(duration)
        
        # Break prompt into shots
        shots = self._break_into_shots(prompt, shot_count, style)
        
        # Generate each shot
        clips = []
        for i, shot in enumerate(shots):
            try:
                clip = await self._generate_shot(
                    prompt=shot["prompt"],
                    duration=shot["duration"],
                    style=style,
                    index=i,
                    total=len(shots),
                    **kwargs
                )
                clips.append(clip)
            except Exception as e:
                # Skip failed shots but continue processing others
                print(f"Warning: Shot {i} failed: {e}")
                continue
        
        # Chain clips together
        if not clips:
            raise ProviderError("No clips were successfully generated")
        
        result = await self._chain_clips(clips)
        
        return {
            "success": True,
            "video_url": result.get("output_url"),
            "duration": sum(c["duration"] for c in clips),
            "shots_generated": len(clips),
            "metadata": result
        }
    
    def _calculate_shot_count(self, duration: int) -> int:
        """Calculate optimal number of shots for duration.
        
        Args:
            duration: Total video duration in seconds
            
        Returns:
            Recommended number of shots
        """
        # Aim for ~5 second shots with some buffer
        shot_duration = max(self.MIN_SHOT_DURATION, duration // 12)
        shot_count = max(4, min(12, duration // shot_duration))
        return shot_count
    
    def _break_into_shots(
        self,
        prompt: str,
        shot_count: int,
        style: str
    ) -> List[Dict[str, Any]]:
        """Break a prompt into individual shot descriptions.
        
        Args:
            prompt: Original prompt
            shot_count: Number of shots to create
            style: Visual style
            
        Returns:
            List of shot dictionaries with prompts and durations
        """
        # Simplified prompt breaking - in production, use LLM to decompose
        base_duration = max(self.MIN_SHOT_DURATION, 
                          (self.MAX_TOTAL_DURATION - (shot_count - 1) * self.TRANSITION_DURATION) // shot_count)
        
        shots = []
        for i in range(shot_count):
            # Add shot-specific context to prompt
            shot_prompt = f"{prompt}, shot {i+1}/{shot_count}, {style}"
            
            # Vary duration slightly for natural feel
            duration = base_duration + (i % 3) - 1
            duration = max(self.MIN_SHOT_DURATION, duration)
            
            shots.append({
                "prompt": shot_prompt,
                "duration": duration,
                "index": i
            })
        
        return shots
    
    async def _generate_shot(
        self,
        prompt: str,
        duration: int,
        style: str,
        index: int,
        total: int,
        **kwargs
    ) -> Dict[str, Any]:
        """Generate a single video shot.
        
        Args:
            prompt: Shot-specific prompt
            duration: Duration in seconds
            style: Visual style
            index: Shot index (for progress tracking)
            total: Total number of shots
            **kwargs: Additional parameters
            
        Returns:
            Generated clip metadata
        """
        # Generate video clip
        result = await self.provider.generate_video(
            prompt=prompt,
            duration=duration,
            style=style,
            **kwargs
        )
        
        return {
            "url": result.get("video_url"),
            "duration": duration,
            "index": index,
            "total": total,
            "metadata": result
        }
    
    async def _chain_clips(
        self,
        clips: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Chain multiple clips into a single video.
        
        Args:
            clips: List of clip metadata
            
        Returns:
            Combined video metadata
        """
        # In a real implementation, this would:
        # 1. Download each clip
        # 2. Apply transitions between clips
        # 3. Concatenate using FFmpeg or similar
        # 4. Upload final result
        
        # For now, return placeholder
        return {
            "output_url": f"https://example.com/videomachine/combined_{len(clips)}clips.mp4",
            "clips_chained": len(clips),
            "total_duration": sum(c["duration"] for c in clips),
            "status": "processing"  # Would be completed after assembly
        }


class VideoChainingError(Exception):
    """Raised when video chaining fails."""
    pass
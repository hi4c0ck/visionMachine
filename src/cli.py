"""VisionMachine CLI entry point."""
import argparse
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description='VisionMachine - Vision Processing Pipeline')
    parser.add_argument('--version', action='version', version='VisionMachine 0.1.0')
    parser.add_argument('--debug', action='store_true', help='Enable debug logging')
    
    subparsers = parser.add_subparsers(dest='command', help='Commands')
    
    # Process command
    process_parser = subparsers.add_parser('process', help='Process images')
    process_parser.add_argument('input', type=Path, help='Input image path')
    process_parser.add_argument('--output', '-o', type=Path, help='Output path')
    process_parser.add_argument('--size', '-s', type=int, nargs=2, metavar=('W', 'H'), help='Target size')
    
    args = parser.parse_args()
    
    if args.command == 'process':
        print(f"Processing {args.input}...")
        # TODO: Implement processing logic
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == '__main__':
    main()
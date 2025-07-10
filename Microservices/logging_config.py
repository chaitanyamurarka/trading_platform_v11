import logging
import os
from logging.handlers import TimedRotatingFileHandler
from pythonjsonlogger import jsonlogger
from colorlog import ColoredFormatter
import datetime

# Global variable for correlation ID (can be set by middleware)
correlation_id = None

class CustomJsonFormatter(jsonlogger.JsonFormatter):
    def add_fields(self, log_record, record, message_dict):
        super(CustomJsonFormatter, self).add_fields(log_record, record, message_dict)
        if not log_record.get('timestamp'):
            log_record['timestamp'] = datetime.datetime.fromtimestamp(record.created).isoformat()
        if record.levelname:
            log_record['level'] = record.levelname
        else:
            log_record['level'] = record.levelno
        if correlation_id:
            log_record['correlation_id'] = correlation_id

def setup_logging(service_name: str):
    log_dir = os.path.join("logs", service_name, datetime.date.today().strftime("%Y-%m-%d"))
    os.makedirs(log_dir, exist_ok=True)

    # Root logger configuration
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG) # Capture all levels for file logging

    # Clear existing handlers to prevent duplicate logs
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Console Handler (INFO, WARNING, ERROR with color)
    console_formatter = ColoredFormatter(
        "%(log_color)s%(levelname)-8s%(reset)s %(message)s",
        log_colors={
            'DEBUG': 'cyan',
            'INFO': 'green',
            'WARNING': 'yellow',
            'ERROR': 'red',
            'CRITICAL': 'red,bg_white',
        },
        secondary_log_colors={},
        style='%'
    )
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO) # Only INFO, WARNING, ERROR to console
    console_handler.setFormatter(console_formatter)
    root_logger.addHandler(console_handler)

    # File Handlers (DEBUG, INFO, WARNING, ERROR - JSON format)
    log_levels = {
        "debug": logging.DEBUG,
        "info": logging.INFO,
        "warning": logging.WARNING,
        "error": logging.ERROR
    }

    json_formatter = CustomJsonFormatter(
        '%(timestamp)s %(level)s %(name)s %(message)s',
        rename_fields={'levelname': 'level', 'asctime': 'timestamp'}
    )

    for level_name, level_value in log_levels.items():
        file_handler = TimedRotatingFileHandler(
            os.path.join(log_dir, f"{level_name}.log"),
            when="midnight",
            interval=1,
            backupCount=30,
            encoding='utf-8'
        )
        file_handler.setLevel(level_value)
        file_handler.setFormatter(json_formatter)
        root_logger.addHandler(file_handler)

    # Suppress DEBUG from console for root logger
    for handler in root_logger.handlers:
        if isinstance(handler, logging.StreamHandler) and handler.level == logging.INFO:
            handler.addFilter(lambda record: record.levelno >= logging.INFO)

    # Uvicorn logger configuration
    uvicorn_access_logger = logging.getLogger("uvicorn.access")
    uvicorn_access_logger.propagate = False # Prevent logs from going to root logger
    uvicorn_access_logger.setLevel(logging.ERROR) # Only errors to console for uvicorn access

    uvicorn_error_logger = logging.getLogger("uvicorn.error")
    uvicorn_error_logger.propagate = False # Prevent logs from going to root logger
    uvicorn_error_logger.setLevel(logging.ERROR) # Only errors to console for uvicorn error

    # Add file handler for uvicorn logs
    uvicorn_file_handler = TimedRotatingFileHandler(
        os.path.join(log_dir, "uvicorn.log"),
        when="midnight",
        interval=1,
        backupCount=30,
        encoding='utf-8'
    )
    uvicorn_file_handler.setLevel(logging.INFO) # Log all uvicorn info to file
    uvicorn_file_handler.setFormatter(json_formatter)
    uvicorn_access_logger.addHandler(uvicorn_file_handler)
    uvicorn_error_logger.addHandler(uvicorn_file_handler)

    # Add console handler for uvicorn errors
    uvicorn_console_handler = logging.StreamHandler()
    uvicorn_console_handler.setLevel(logging.ERROR)
    uvicorn_console_handler.setFormatter(console_formatter)
    uvicorn_access_logger.addHandler(uvicorn_console_handler)
    uvicorn_error_logger.addHandler(uvicorn_console_handler)

    # Example of how to use the logger
    # logger = logging.getLogger(__name__)
    # logger.debug("This is a debug message.")
    # logger.info("This is an info message.")
    # logger.warning("This is a warning message.")
    # logger.error("This is an error message.")
    # logger.critical("This is a critical message.")

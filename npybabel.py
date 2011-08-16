#!/usr/bin/python
# EASY-INSTALL-ENTRY-SCRIPT: 'Babel==0.9.6','console_scripts','pybabel'
__requires__ = 'Babel==0.9.6'
import sys
from pkg_resources import load_entry_point
import re
import json

if __name__ == '__main__':
    sys.exit(
        load_entry_point('Babel==0.9.6', 'console_scripts', 'pybabel')()
    )
    
QWEB_EXPR = re.compile(r"""(?:\< *t\-tr *\>(.*?)\< *\/t\-tr *\>)|(?:\_t *\( *((?:"(?:[^"\\]|\\.)*")|(?:'(?:[^'\\]|\\.)*')) *\))""")
XML_GROUP = 1
JS_GROUP = 2

def extract_qweb(fileobj, keywords, comment_tags, options):
    """Extract messages from XXX files.
    :param fileobj: the file-like object the messages should be extracted
                    from
    :param keywords: a list of keywords (i.e. function names) that should
                     be recognized as translation functions
    :param comment_tags: a list of translator tags to search for and
                         include in the results
    :param options: a dictionary of additional options (optional)
    :return: an iterator over ``(lineno, funcname, message, comments)``
             tuples
    :rtype: ``iterator``
    """
    content = fileobj.read()
    found = QWEB_EXPR.finditer(content)
    result = []
    index = 0
    line_nbr = 0
    for f in found:
        group = XML_GROUP if f.group(XML_GROUP) else JS_GROUP
        mes = f.group(group)
        if group == JS_GROUP:
            mes = json.loads(mes)
        while index < f.start():
            if content[index] == "\n":
                line_nbr += 1
            index += 1
        result.append((line_nbr, None, mes, ""))
    return result
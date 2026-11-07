#!/usr/bin/env python3
"""Register Swift files in Jacked.xcodeproj (file ref + group + Sources phase). Idempotent.
   Tools/pbx-add.py Jacked/Data/Blob.swift Jacked/Views/HomeView.swift ...
   A new folder under Jacked/ gets its own group. Hand-editing the pbxproj is how the
   project has always been maintained (no XcodeGen on the desktop)."""
import sys, os, re, hashlib
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
pbx = os.path.join(root, "Jacked.xcodeproj", "project.pbxproj")
s = open(pbx).read()
def uid(tag): return hashlib.md5(tag.encode()).hexdigest()[:24].upper()
JACKED_GROUP = "EEC889EE9AE22DB59B338063"
SOURCES = "CA3DF29E9FE296D36EC947D5"
def group_id(folder):
    m = re.search(r"([0-9A-F]{24}) /\* %s \*/ = \{\s*isa = PBXGroup;" % re.escape(folder), s)
    return m.group(1) if m else None
for rel in sys.argv[1:]:
    parts = rel.split("/"); assert parts[0] == "Jacked" and len(parts) == 3, rel
    folder, name = parts[1], parts[2]
    if f"/* {name} */ = {{isa = PBXFileReference" in s: continue
    fid, bid = uid("ref:" + rel), uid("build:" + rel)
    g = group_id(folder)
    if not g:
        g = uid("group:" + folder)
        s = s.replace("/* End PBXGroup section */",
            f"\t\t{g} /* {folder} */ = {{\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n\t\t\t);\n\t\t\tpath = {folder};\n\t\t\tsourceTree = \"<group>\";\n\t\t}};\n/* End PBXGroup section */")
        s = re.sub(r"(%s /\* Jacked \*/ = \{\s*isa = PBXGroup;\s*children = \(\n)" % JACKED_GROUP, r"\g<1>" + f"\t\t\t\t{g} /* {folder} */,\n", s)
    s = s.replace("/* End PBXFileReference section */",
        f"\t\t{fid} /* {name} */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {name}; sourceTree = \"<group>\"; }};\n/* End PBXFileReference section */")
    s = s.replace("/* End PBXBuildFile section */",
        f"\t\t{bid} /* {name} in Sources */ = {{isa = PBXBuildFile; fileRef = {fid} /* {name} */; }};\n/* End PBXBuildFile section */")
    s = re.sub(r"(%s /\* %s \*/ = \{\s*isa = PBXGroup;\s*children = \(\n)" % (g, re.escape(folder)), r"\g<1>" + f"\t\t\t\t{fid} /* {name} */,\n", s)
    s = re.sub(r"(%s /\* Sources \*/ = \{\s*isa = PBXSourcesBuildPhase;\s*buildActionMask = \d+;\s*files = \(\n)" % SOURCES, r"\g<1>" + f"\t\t\t\t{bid} /* {name} in Sources */,\n", s)
    print("added", rel)
open(pbx, "w").write(s)

#include "FlowFestTreeTools.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "StaticMeshCompiler.h"

bool UFlowFestTreeTools::CopyNaniteAssembly(USkeletalMesh* From, UStaticMesh* To)
{
#if WITH_EDITORONLY_DATA
    if (!From || !To) return false;
    FNaniteAssemblyData Assembly = From->GetNaniteSettings().NaniteAssemblyData;
    if (!Assembly.IsValid()) return false;
    // Node transforms are already in mesh space; bone attachments mean nothing on a static mesh.
    for (FNaniteAssemblyNode& Node : Assembly.Nodes) Node.BoneInfluences.Empty();
    // A skeletal assembly instances skeletal parts (SKM_Branch_...); a static assembly may only instance static
    // meshes. Every Megaplants pack ships the static twin beside it under the same name without the prefix.
    for (FNaniteAssemblyPart& Part : Assembly.Parts)
    {
        FString Path = Part.MeshObjectPath.ToString();
        const int32 Slash = Path.Find(TEXT("/"), ESearchCase::CaseSensitive, ESearchDir::FromEnd);
        if (Slash == INDEX_NONE || !Path.Mid(Slash + 1).StartsWith(TEXT("SKM_"))) continue;
        FString Name = Path.Mid(Slash + 1);
        Name.RemoveFromStart(TEXT("SKM_"));
        int32 Dot = INDEX_NONE;
        if (Name.FindChar(TEXT('.'), Dot)) Name = Name.Left(Dot);
        const FString Twin = FString::Printf(TEXT("%s/%s.%s"), *Path.Left(Slash), *Name, *Name);
        if (!LoadObject<UStaticMesh>(nullptr, *Twin))
        {
            UE_LOG(LogTemp, Error, TEXT("CopyNaniteAssembly: no static twin %s for part %s"), *Twin, *Path);
            return false;
        }
        Part.MeshObjectPath = FSoftObjectPath(Twin);
    }
    // Part meshes still compiling trip an engine assert inside RecacheNaniteAssemblyReferences's own wait, so
    // finish them here and recache without waiting.
    TArray<UStaticMesh*> Parts;
    for (const FNaniteAssemblyPart& Part : Assembly.Parts)
    {
        if (UStaticMesh* PartMesh = LoadObject<UStaticMesh>(nullptr, *Part.MeshObjectPath.ToString())) Parts.Add(PartMesh);
    }
    Parts.Add(To);
    FStaticMeshCompilingManager::Get().FinishCompilation(Parts);
    FMeshNaniteSettings& Settings = To->GetNaniteSettings();
    Settings.bEnabled = true;
    Settings.NaniteAssemblyData = MoveTemp(Assembly);
    // The distance field and Nanite builders assert on an assembly whose part meshes are not cached.
    To->RecacheNaniteAssemblyReferences(false);
    To->PostEditChange();
    FStaticMeshCompilingManager::Get().FinishCompilation({To});
    To->MarkPackageDirty();
    return true;
#else
    return false;
#endif
}

void UFlowFestTreeTools::FinishMeshCompilation()
{
#if WITH_EDITOR
    FStaticMeshCompilingManager::Get().FinishAllCompilation();
#endif
}
